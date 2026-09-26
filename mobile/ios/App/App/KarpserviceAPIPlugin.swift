import Foundation
import Security
import UIKit
import Capacitor

// Session credentials stay in native code. JavaScript can call only these API routes.
@objc(KarpserviceAPIPlugin)
public final class KarpserviceAPIPlugin: CAPPlugin, CAPBridgedPlugin, URLSessionTaskDelegate {
    public let identifier = "KarpserviceAPIPlugin"
    public let jsName = "KarpserviceAPI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private let apiOrigin = "https://karpservice-api.venyast31.workers.dev"
    private let stateQueue = DispatchQueue(label: "ua.karpservice.session")
    private var generation = 0
    private let vault = SessionVault()
    private let routes: [String: String] = [
        "": "GET", "order": "GET", "availability": "GET", "cars": "POST",
        "cars/remove": "POST", "booking": "POST", "auth/request": "POST",
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
                let publicRoute = ["auth/request", "auth/link-status", "auth/verify", "auth/logout"].contains(route)
                if !publicRoute && token == nil {
                    call.resolve(["status": 401, "data": ["success": false, "error": "Підтвердьте вхід через Telegram."]])
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
                            if route == "auth/verify", (200..<300).contains(response.statusCode), result["success"] as? Bool == true {
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
