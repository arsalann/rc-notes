import Foundation
import Security

/// Mirrors the `rc-session` cookie into the Keychain. `HTTPCookieStorage` persists to disk
/// asynchronously, so a session could be lost if the app is killed right after signing in.
/// Keychain writes are synchronous; on launch a missing cookie is restored from here.
enum SessionCookieVault {
    private static let service = "com.arsalann.daybook.session"
    private static let cookieName = "rc-session"

    private static func account(for baseURL: URL) -> String { baseURL.absoluteString }

    /// Saves the current session cookie for `baseURL` (or clears the vault if there is none).
    static func capture(for baseURL: URL, storage: HTTPCookieStorage = .shared) {
        guard let cookie = storage.cookies(for: baseURL)?.first(where: { $0.name == cookieName }),
              let properties = cookie.properties else {
            clear(for: baseURL)
            return
        }
        let serializable = properties.reduce(into: [String: Any]()) { result, item in
            if let date = item.value as? Date {
                result[item.key.rawValue] = date.timeIntervalSince1970
                result["__date__" + item.key.rawValue] = true
            } else if let url = item.value as? URL {
                result[item.key.rawValue] = url.absoluteString
            } else {
                result[item.key.rawValue] = item.value
            }
        }
        guard let data = try? PropertyListSerialization.data(fromPropertyList: serializable, format: .binary, options: 0) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account(for: baseURL),
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    /// Puts the saved cookie back into cookie storage if storage lost it.
    static func restore(for baseURL: URL, storage: HTTPCookieStorage = .shared) {
        if storage.cookies(for: baseURL)?.contains(where: { $0.name == cookieName }) == true { return }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account(for: baseURL),
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data,
              let raw = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else { return }
        var properties: [HTTPCookiePropertyKey: Any] = [:]
        for (key, value) in raw where !key.hasPrefix("__date__") {
            if raw["__date__" + key] != nil, let seconds = value as? TimeInterval {
                properties[HTTPCookiePropertyKey(key)] = Date(timeIntervalSince1970: seconds)
            } else {
                properties[HTTPCookiePropertyKey(key)] = value
            }
        }
        if let expires = properties[.expires] as? Date, expires < Date() {
            query.removeValue(forKey: kSecReturnData as String)
            query.removeValue(forKey: kSecMatchLimit as String)
            SecItemDelete(query as CFDictionary)
            return
        }
        if let cookie = HTTPCookie(properties: properties) { storage.setCookie(cookie) }
    }

    static func clear(for baseURL: URL) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account(for: baseURL),
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearAll() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    }
}
