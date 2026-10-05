import Foundation
import Vision

// CI-only: reject a splash screen or a capture missing the Apple login label.
guard CommandLine.arguments.count == 2 else { exit(2) }
do {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1])).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    guard lines.contains(where: { $0.range(of: "(sign|continue|увійти|войти).*apple", options: [.caseInsensitive, .regularExpression]) != nil }) else {
        fputs("Apple login label is not visible yet.\n", stderr)
        exit(1)
    }
    print("Apple login label verified in simulator screenshot.")
} catch {
    fputs("Login screenshot recognition failed.\n", stderr)
    exit(1)
}
