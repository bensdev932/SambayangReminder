# Object-Oriented Domain Design

## 1. Responsibility-Driven Design (RDD)

Objects are defined by their **responsibilities**, not merely their data fields.

When designing or refactoring classes across **Java, C++, C#, PHP, Python, TypeScript**, and **Rust**, answer three questions for each type:
1. What does this object **know**? (State, invariants, internal relations).
2. What does this object **do**? (Calculations, transformations, state transitions).
3. What does this object **decide**? (Domain validation, business rule gating).

---

## 2. Core Principles of Object Design

### Tell, Don't Ask
Never interrogate an object's internal fields to execute logic externally. Command the object to perform its own behavior:

```
// BAD: Interrogating state and mutating from outside
if (account.getBalance() >= requestedAmount) {
    account.setBalance(account.getBalance() - requestedAmount);
}

// GOOD: Commanding the domain entity to enforce its invariants
account.withdraw(requestedAmount);
```

---

### Composition Over Inheritance
Deep inheritance hierarchies (`class Employee extends Person extends Mammal extends Entity`) create tight coupling, brittle base class syndrome, and parallel hierarchies.
- **Prefer Composition**: Compose capabilities by holding references to smaller, focused collaborators.
- **In Rust**: Inheritance does not exist; composition is the default and only paradigm (`struct MyService { repo: MyRepo, logger: MyLogger }`).

---

### Value Objects vs. Entities (Domain-Driven Design)

1. **Entities**: Have a unique identity that persists across state changes (e.g., `PatientId(123)`, `OrderId("ord_99")`). Two entities with different IDs are never equal, even if all their properties match.
2. **Value Objects**: Defined exclusively by their attributes; have no identity and are immutable (e.g., `Money`, `EmailAddress`, `DateRange`). Two value objects with identical values are interchangeable.
