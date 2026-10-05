import Foundation
import Security
import UIKit
import Capacitor
import AuthenticationServices

// Session credentials stay in native code. JavaScript can call only these API routes.
@objc(KarpserviceAPIPlugin)
public final class KarpserviceAPIPlugin: CAPPlugin, CAPBridgedPlugin, URLSessionTaskDelegate, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "KarpserviceAPIPlugin"
    public let jsName = "KarpserviceAPI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appleButtonArtwork", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private let apiOrigin = "https://karpservice-api.venyast31.workers.dev"
    private let stateQueue = DispatchQueue(label: "ua.karpservice.session")
    private var generation = 0
    private let vault = SessionVault()
    private var appleFlow: AppleSignInFlow?
    private let routes: [String: String] = [
        "": "GET", "order": "GET", "availability": "GET", "cars": "POST",
        "cars/remove": "POST", "booking": "POST", "auth/request": "POST", "auth/password": "POST",
        "account/deletion-policy": "GET", "account/deletion": "POST",
        "auth/link-status": "POST", "auth/verify": "POST", "auth/logout": "POST", "auth/me": "GET"
    ]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 45
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    public override func load() {
        // Keychain items may survive uninstalling an app; do not restore an old installation's login.
        if !UserDefaults.standard.bool(forKey: "karpservice.installation.v1") {
            try? vault.clear()
            UserDefaults.standard.set(true, forKey: "karpservice.installation.v1")
        }
    }

    @objc public func request(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              !path.contains("\\"), !path.contains("\n"), !path.contains("\r"),
              let relative = URLComponents(string: path),
              relative.scheme == nil, relative.host == nil, relative.fragment == nil,
              !relative.path.hasPrefix("/"),
              let expectedMethod = routes[relative.path],
              let method = call.getString("method"), method == expectedMethod,
              let url = URL(string: apiOrigin + "/" + path),
              url.host == "karpservice-api.venyast31.workers.dev", url.scheme == "https" else {
            call.reject("Цей запит не підтримується.")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let body = call.getString("body") {
            guard method == "POST", let bytes = body.data(using: .utf8), bytes.count <= 16_384,
                  (try? JSONSerialization.jsonObject(with: bytes)) is [String: Any] else {
                call.reject("Некоректний формат даних.")
                return
            }
            request.httpBody = bytes
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let route = relative.path
        stateQueue.async {
            do {
                let saved = try self.vault.read()
                let token = (saved?.expiresAt ?? 0) > Date().timeIntervalSince1970 ? saved?.token : nil
                if saved != nil && token == nil { try self.vault.clear() }
                let publicRoute = ["auth/password", "auth/request", "auth/link-status", "auth/verify", "auth/logout"].contains(route)
                if !publicRoute && token == nil {
                    call.resolve(["status": 401, "data": ["success": false, "error": "Увійдіть у профіль Karpservice."]])
                    return
                }
                if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
                if route == "auth/logout" {
                    self.generation += 1
                    try self.vault.clear()
                    if token == nil {
                        call.resolve(["status": 200, "data": ["success": true]])
                        return
                    }
                }
                let capturedGeneration = self.generation
                self.session.dataTask(with: request) { data, response, error in
                    self.stateQueue.async {
                        guard capturedGeneration == self.generation else {
                            call.reject("Вхід завершено.")
                            return
                        }
                        if error != nil {
                            if route == "auth/logout" {
                                call.resolve(["status": 200, "data": ["success": true, "remote_revocation": false]])
                            } else { call.reject("Не вдалося з’єднатися із сервісом. Перевірте інтернет і спробуйте ще раз.") }
                            return
                        }
                        guard let response = response as? HTTPURLResponse, let data,
                              var result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                            call.reject("Сервіс повернув некоректну відповідь.")
                            return
                        }
                        do {
                            if ["auth/verify", "auth/password"].contains(route), (200..<300).contains(response.statusCode), result["success"] as? Bool == true {
                                guard let rawToken = result["token"] as? String,
                                      rawToken.range(of: "^[A-Za-z0-9_-]{40,100}$", options: .regularExpression) != nil,
                                      let expiry = result["expires_at"] as? Double,
                                      expiry > Date().timeIntervalSince1970 else {
                                    call.reject("Сервіс не повернув коректний ключ входу.")
                                    return
                                }
                                try self.vault.save(SavedSession(token: rawToken, expiresAt: min(expiry, Date().timeIntervalSince1970 + 604_800)))
                                result["session_stored"] = true
                            } else if response.statusCode == 401 && !publicRoute {
                                try self.vault.clear()
                            }
                            result.removeValue(forKey: "token")
                            result.removeValue(forKey: "token_type")
                            call.resolve(["status": response.statusCode, "data": result])
                        } catch { call.reject("Не вдалося зберегти захищений вхід на iPhone.") }
                    }
                }.resume()
            } catch { call.reject("Не вдалося відкрити захищене сховище iPhone. Розблокуйте пристрій і спробуйте ще раз.") }
        }
    }

    // Render Apple's own localized artwork for the web view's accessible button.
    @objc public func appleButtonArtwork(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let width = min(600, max(200, call.getDouble("width") ?? 320))
            let button = ASAuthorizationAppleIDButton(type: .signIn, style: .white)
            button.frame = CGRect(x: 0, y: 0, width: width, height: 54)
            button.cornerRadius = 12
            button.layoutIfNeeded()
            let image = UIGraphicsImageRenderer(size: button.bounds.size).image { context in
                button.layer.render(in: context.cgContext)
            }
            guard let data = image.pngData() else { call.reject("Не вдалося показати кнопку Apple."); return }
            call.resolve(["image": "data:image/png;base64," + data.base64EncodedString()])
        }
    }

    @objc public func signInWithApple(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "login"
        guard ["login", "link"].contains(mode) else { call.reject("Некоректний спосіб входу."); return }
        DispatchQueue.main.async {
            guard self.appleFlow == nil, let anchor = self.bridge?.viewController?.view.window else {
                call.reject("Завершіть попередню спробу входу."); return
            }
            let flow = AppleSignInFlow(call: call, mode: mode, anchor: anchor)
            self.appleFlow = flow
            self.stateQueue.async {
                do {
                    let saved = try self.vault.read()
                    let token = (saved?.expiresAt ?? 0) > Date().timeIntervalSince1970 ? saved?.token : nil
                    let capturedGeneration = self.generation
                    DispatchQueue.main.async {
                        guard self.appleFlow === flow else { return }
                        flow.generation = capturedGeneration
                        flow.bearer = mode == "link" ? token : nil
                        self.appleRequest("start", body: ["mode": mode], bearer: flow.bearer) { result in
                            guard self.appleFlow === flow else { return }
                            switch result {
                            case .failure(let error): self.finishApple(flow, error: error.localizedDescription)
                            case .success(let data):
                                guard let challenge = data["challenge_id"] as? String,
                                      challenge.range(of: "^[A-Za-z0-9_-]{32}$", options: .regularExpression) != nil,
                                      let nonce = data["nonce"] as? String,
                                      nonce.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                                    self.finishApple(flow, error: "Сервіс не підготував вхід через Apple."); return
                                }
                                flow.challenge = challenge
                                let request = ASAuthorizationAppleIDProvider().createRequest()
                                request.requestedScopes = [.fullName, .email]
                                request.nonce = nonce
                                request.state = challenge
                                let controller = ASAuthorizationController(authorizationRequests: [request])
                                controller.delegate = self
                                controller.presentationContextProvider = self
                                flow.controller = controller
                                controller.performRequests()
                            }
                        }
                    }
                } catch { DispatchQueue.main.async { self.finishApple(flow, error: "Розблокуйте iPhone і спробуйте ще раз.") } }
            }
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return appleFlow?.anchor ?? bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let flow = appleFlow,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == flow.challenge,
              let tokenData = credential.identityToken, let identityToken = String(data: tokenData, encoding: .utf8),
              let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) else {
            if let flow = appleFlow { finishApple(flow, error: "Apple не підтвердила цю спробу входу.") }
            return
        }
        let name = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) } ?? ""
        appleRequest("complete", body: ["challenge_id": flow.challenge, "identity_token": identityToken, "authorization_code": code, "name": name], bearer: flow.bearer) { result in
            guard self.appleFlow === flow else { return }
            switch result {
            case .failure(let error): self.finishApple(flow, error: error.localizedDescription)
            case .success(let data):
                guard let rawToken = data["token"] as? String,
                      rawToken.range(of: "^apple_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
                      let expiry = data["expires_at"] as? Double,
                      expiry > Date().timeIntervalSince1970 else {
                    self.finishApple(flow, error: "Сервіс не повернув захищену сесію."); return
                }
                self.stateQueue.async {
                    do {
                        guard flow.generation == self.generation else {
                            DispatchQueue.main.async { self.finishApple(flow, error: "Вхід скасовано. Спробуйте ще раз.") }; return
                        }
                        try self.vault.save(SavedSession(token: rawToken, expiresAt: min(expiry, Date().timeIntervalSince1970 + 604_800), appleUserID: credential.user))
                        self.generation += 1
                        DispatchQueue.main.async { self.finishApple(flow, error: nil) }
                    } catch { DispatchQueue.main.async { self.finishApple(flow, error: "Не вдалося зберегти вхід у захищеному сховищі iPhone.") } }
                }
            }
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let flow = appleFlow else { return }
        if let appleError = error as? ASAuthorizationError, appleError.code == .canceled {
            appleFlow = nil
            flow.call.resolve(["cancelled": true])
        } else { finishApple(flow, error: "Не вдалося увійти через Apple. Перевірте Apple Account у налаштуваннях iPhone та спробуйте ще раз.") }
    }

    private func finishApple(_ flow: AppleSignInFlow, error: String?) {
        guard appleFlow === flow else { return }
        appleFlow = nil
        if let error { flow.call.reject(error) }
        else { flow.call.resolve(["success": true, "session_stored": true]) }
    }

    // Identity tokens, authorization codes and session tokens never cross the JS bridge.
    private func appleRequest(_ stage: String, body: [String: Any], bearer: String?, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        var request = URLRequest(url: URL(string: apiOrigin + "/auth/apple/" + stage)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        session.dataTask(with: request) { data, response, error in
            let result: Result<[String: Any], Error>
            if error != nil {
                result = .failure(NSError(domain: "Karpservice", code: 1, userInfo: [NSLocalizedDescriptionKey: "Не вдалося з’єднатися із сервісом. Спробуйте ще раз."]))
            } else if let response = response as? HTTPURLResponse, let data,
                      let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                if response.statusCode == 200 && payload["success"] as? Bool == true { result = .success(payload) }
                else { result = .failure(NSError(domain: "Karpservice", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: payload["error"] as? String ?? "Не вдалося підтвердити вхід через Apple."])) }
            } else { result = .failure(NSError(domain: "Karpservice", code: 2, userInfo: [NSLocalizedDescriptionKey: "Некоректна відповідь сервісу."])) }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }

    // Never forward an Authorization header to a redirect target, even on the same host.
    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest,
                           completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    @objc public func openExternal(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              (url.scheme == "https" && ["t.me", "maps.apple.com"].contains(url.host ?? "")) ||
              (url.scheme == "tel" && raw == "tel:+380734447344") else {
            call.reject("Непідтримуване посилання.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Не вдалося відкрити посилання.") }
            }
        }
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("Налаштування недоступні."); return }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Не вдалося відкрити налаштування.") }
            }
        }
    }
}

private struct SavedSession: Codable {
    let token: String
    let expiresAt: Double
    var appleUserID: String? = nil
}

private final class AppleSignInFlow {
    let call: CAPPluginCall
    let mode: String
    let anchor: ASPresentationAnchor
    var generation = 0
    var bearer: String?
    var challenge = ""
    var controller: ASAuthorizationController?
    init(call: CAPPluginCall, mode: String, anchor: ASPresentationAnchor) { self.call = call; self.mode = mode; self.anchor = anchor }
}

private final class SessionVault {
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "ua.karpservice.client.session",
         kSecAttrAccount as String: "current",
         kSecAttrSynchronizable as String: false]
    }
    func read() throws -> SavedSession? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw VaultError.storage(status) }
        do { return try JSONDecoder().decode(SavedSession.self, from: data) }
        catch { try clear(); return nil }
    }
    func save(_ session: SavedSession) throws {
        let data = try JSONEncoder().encode(session)
        let updates: [String: Any] = [kSecValueData as String: data,
                                     kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let updateStatus = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw VaultError.storage(updateStatus) }
        let status = SecItemAdd(query.merging(updates) { _, new in new } as CFDictionary, nil)
        guard status == errSecSuccess else { throw VaultError.storage(status) }
    }
    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw VaultError.storage(status) }
    }
    private enum VaultError: Error { case storage(OSStatus) }
}
