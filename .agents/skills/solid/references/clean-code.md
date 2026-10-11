# Clean Code Practices in Object-Oriented Software

## What is Clean Code?

Clean code across Object-Oriented ecosystems (**Java, C++, C#, PHP, Python, TypeScript**) is code that is:
- **Understandable** — reveals domain intent and business rules immediately.
- **Changeable** — modifications are localized to cohesive classes and vertical slices.
- **Testable** — dependencies are injected abstractions; functions are side-effect controlled.
- **Minimal** — zero accidental complexity, dead code, or premature abstractions.

> *"Developers spend roughly 10 times more time reading code than authoring it. Optimize for the reader, not the typist."*

---

## 1. Naming Principles

### Consistency & Ubiquitous Language (Highest Priority)
One domain concept = one term across the entire codebase. Never mix synonyms:
- **BAD**: `getPatientById(id)`, `fetchClient(id)`, `retrieveCustomer(id)`.
- **GOOD**: `getPatient(id)`, `getAppointment(id)`, `getTreatment(id)`.

### Domain Language over Storage Jargon
- **BAD**: `var list = db.Query().Where(x => x.Active).ToList();`
- **GOOD**: `var activeSubscribers = subscriberRepo.FindActiveSubscribers();`

### Specificity (Avoid Empty Vague Names)
Avoid names like `Data`, `Info`, `Manager`, `Processor`, `Helper`, `Utils`:
- **BAD**: `DataManager`, `UserProcessor`, `OrderHelper`.
- **GOOD**: `AccountBillingCalculator`, `UserRegistrationValidator`, `OrderInvoiceRenderer`.

---

## 2. Functions & Methods

### Parameter Count
- **0 to 2 parameters**: Ideal readability and testability.
- **3+ parameters**: Bundle into a typed Command or Parameter Object (e.g. `RegisterUserCommand`, `SearchCriteria`).

```typescript
// BAD: Fat positional argument list
function createPatient(first: string, last: string, email: string, ssn: string, dob: Date, phone: string);

// GOOD: Cohesive Command structure
interface CreatePatientCommand {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: EmailAddress;
  readonly dateOfBirth: Date;
  readonly phoneNumber: string;
}
function createPatient(cmd: CreatePatientCommand): Promise<PatientId>;
```

### Single Level of Abstraction per Method
All statements in a method should be at the same conceptual tier, exactly one level below the method name:
```python
# GOOD: Method orchestrates high-level steps; details live in private helpers
def register_member(self, command: RegisterMemberCommand) -> MemberId:
    self._validate_command(command)
    member = self._build_member_entity(command)
    self._repository.save(member)
    self._event_publisher.publish(MemberRegisteredEvent(member.id))
    return member.id
```

---

## 3. Control Flow & Object Calisthenics

### 1. Maximum One Level of Indentation
Extract nested loops and nested branches into dedicated, well-named helper methods.

### 2. Don't Use the `else` Keyword (Guard Clauses & Early Returns)
```java
// BAD: Deeply nested indentation
public BigDecimal calculateDiscount(Customer customer) {
    if (customer != null) {
        if (customer.isVip()) {
            return new BigDecimal("0.20");
        } else {
            return new BigDecimal("0.05");
        }
    } else {
        return BigDecimal.ZERO;
    }
}

// GOOD: Flattened with fail-fast guard clauses
public BigDecimal calculateDiscount(Customer customer) {
    if (customer == null) return BigDecimal.ZERO;
    if (customer.isVip()) return new BigDecimal("0.20");
    return new BigDecimal("0.05");
}
```

### 3. Wrap All Primitives (Universal Value Objects)
Wrap raw primitives (`int`, `string`, `float`) into domain types that guarantee invariant validation at construction:
- **Java**: `record EmailAddress(String value) { ... }`
- **C#**: `readonly record struct Money(decimal Amount) { ... }`
- **Python**: `@dataclass(frozen=True) class PostalCode: ...`
- **PHP**: `readonly class UserId { public function __construct(private string $value) { ... } }`
- **TypeScript**: Branded types (`type UserId = string & { readonly __brand: unique symbol };`)
- **C++**: Strongly typed wrapper classes with explicit constructors.
- *Rust*: The Newtype Pattern (`pub struct PatientId(pub u64);`).

### 4. First-Class Collections
Any class holding a collection should contain only that collection and its direct operations. Encapsulate filtering, sorting, and invariant checks inside dedicated collection classes.

### 5. One Dot / Arrow per Line (Law of Demeter)
Avoid chaining calls across boundaries: `a.getB().getC().doAction()`. Talk only to immediate collaborators.
*(Note: Method chaining on fluent builders, streams, or pipelines within the same object boundary is fully permitted).*

### 6. Don't Abbreviate
Choose clear, descriptive names (`activeSubscribers` instead of `actSubList`).

### 7. Keep Entities Small
- Classes: < 150 lines of code.
- Methods: < 20 lines of code.
- Parameters: <= 3 parameters.

### 8. Tell, Don't Ask (Encapsulate State & Behavior)
Tell objects what behavior to perform instead of querying their internal state to make external decisions.
