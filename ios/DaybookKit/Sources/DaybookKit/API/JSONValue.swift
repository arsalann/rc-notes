import Foundation

/// A JSON value used for request bodies. Lets partial updates send an explicit `null`
/// (e.g. `{"due_at": null}` clears a due date) while omitting keys that should not change.
public enum JSONValue: Sendable, Equatable, Encodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    /// `.string(value)` or `.null` for a nil optional.
    public static func optional(_ value: String?) -> JSONValue {
        value.map(JSONValue.string) ?? .null
    }

    public static func strings(_ values: [String]) -> JSONValue {
        .array(values.map(JSONValue.string))
    }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByBooleanLiteral, ExpressibleByNilLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .int(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(nilLiteral: ()) { self = .null }
}

public typealias JSONObject = [String: JSONValue]
