import Foundation
import Vision

// CI-only: reject a splash screen or a capture missing the Apple login label.
guard CommandLine.arguments.count == 2 else { exit(2) }
do {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let supported = try request.supportedRecognitionLanguages()
    request.recognitionLanguages = ["uk-UA", "ru-RU", "en-US"].filter { supported.contains($0) }
    request.automaticallyDetectsLanguage = true
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1])).perform([request])
    // AuthenticationServices uses the app's Ukrainian localization ("Вхід з Apple").
    // Check the short, prominent native label instead of assuming English text.
    // The size constraint excludes the smaller explanatory paragraphs about Apple.
    let hasAppleButton = (request.results ?? []).contains { observation in
        guard let label = observation.topCandidates(1).first?.string else { return false }
        let box = observation.boundingBox
        return label.localizedCaseInsensitiveContains("Apple") && label.count <= 40
            && box.height >= 0.014 && box.midY > 0.3 && box.midY < 0.85
    }
    guard hasAppleButton else {
        fputs("Apple login label is not visible yet.\n", stderr)
        exit(1)
    }
    print("Apple login label verified in simulator screenshot.")
} catch {
    fputs("Login screenshot recognition failed.\n", stderr)
    exit(1)
}
