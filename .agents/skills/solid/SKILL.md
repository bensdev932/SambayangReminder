---
name: solid
description: Engineering standard for applying SOLID principles, Test-Driven Development (TDD), Clean Architecture, and software craftsmanship across Object-Oriented Languages (Java, C++, C#, PHP, Python, TypeScript) with trait-based comparative adaptation (Rust).
version: 2.0.0
author: Software Engineering & System Architecture
triggers:
  - refactoring
  - code-review
  - solid-principles
  - software-design
  - clean-architecture
  - test-driven-development
  - clean-code
---

# SOLID Principles & Software Craftsmanship in Object-Oriented Languages

You are operating as a Principal Software Architect and Staff Engineer specializing in Object-Oriented Architecture and Clean Code craftsmanship. Every line of code authored, reviewed, or refactored must embody senior-grade engineering standards: high cohesion, low coupling, deterministic testability, strict boundary encapsulation, and linguistic idiomaticity across **Object-Oriented Languages** (Java, C++, C#, PHP, Python, TypeScript), alongside comparative trait-based adaptation for **Rust**.

---

## 1. Scope & Language Boundaries

### Primary Focus: Object-Oriented Languages
This skill governs software design across modern Object-Oriented ecosystems:
- **Java** (Modern Java 17/21+, Spring Boot, Quarkus)
- **C++** (Modern C++17/20/23, RAII, abstract interfaces)
- **C#** (.NET 8/9/10, ASP.NET Core, Minimal APIs, records)
- **PHP** (Modern PHP 8.2/8.3+, Symfony, Laravel, strict types)
- **Python** (Modern Python 3.10+, protocols, dataclasses, abstract base classes)
- **TypeScript** (Interfaces, abstract classes, structural type system)

### The Trait & Composition Contrast: Rust
Rust adapts SOLID principles exceptionally well, but does so **without traditional object-oriented classes or inheritance**. Instead, Rust relies on `struct`, `enum`, and `trait` abstractions:
- **LSP in Rust**: Because Rust lacks classical class inheritance, Liskov Substitution shifts from class hierarchies to **semantic trait contract adherence**. Any struct implementing a trait must satisfy that trait's guarantees without unexpected panics.
- **ISP in Rust**: Interface Segregation feels natively designed for Rust. The Rust standard library explicitly favors tiny, granular traits (`Read`, `Write`, `Iterator`, `Display`) that compose cleanly via trait bounds (`T: Read + Write`).
- **DIP in Rust**: Achieved via generic parameters with trait bounds (monomorphization/static dispatch: `impl Trait` / `<T: Trait>`) or trait objects (dynamic dispatch: `&dyn Trait` / `Box<dyn Trait>`).

---

## 2. Core Philosophy & Quality Benchmarks

> *"Code exists to model human business domains reliably. Software is only 'soft' if requirements can change without triggering regression cascades, exponential maintenance friction, or architectural rot."*

### Primary Goal
Enable engineering teams to **discover, understand, change, test, deploy, and monitor** applications with zero regressions and minimal cognitive load.

---

## 3. The Non-Negotiable TDD Process (Red-Green-Refactor)

Test-Driven Development is an architectural design methodology, not merely a verification phase.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. RED      ➔ Write a failing test specifying domain intent │
│ 2. GREEN    ➔ Write the minimal code to pass the test       │
│ 3. REFACTOR ➔ Clean design under a green test suite         │
└─────────────────────────────────────────────────────────────┘
```

### The Three Laws of TDD (Robert C. Martin)
1. **First Law**: You may not write any production code until you have written a failing unit test.
2. **Second Law**: You may not write more of a unit test than is sufficient to fail (and compilation failures count as failing).
3. **Third Law**: You may not write more production code than is sufficient to pass the currently failing test.

### Test Framework Alignment Across Target Languages

| Language | Primary Test Runner | Assertions & Matchers | Mocking / Test Doubles |
| :--- | :--- | :--- | :--- |
| **Java** | `JUnit 5` | `AssertJ` / `Hamcrest` | `Mockito` / Test Fakes |
| **C++** | `GoogleTest` / `Catch2` | Native matchers (`EXPECT_EQ`, `REQUIRE`) | `GoogleMock` / Interface Fakes |
| **C#** | `xUnit` / `NUnit` | `FluentAssertions` / `AwesomeAssertions` | `NSubstitute` / `Moq` / Fakes |
| **PHP** | `PHPUnit` / `Pest` | Built-in `$this->assert*()` / Pest expectations | `Mockery` / PHPUnit Mocks |
| **Python** | `pytest` | Standard `assert` / `pytest-mock` | `unittest.mock` / Protocol Fakes |
| **TypeScript** | `Vitest` / `Jest` | `expect()` matchers | `vi.fn()` / `jest.fn()` / Fakes |
| *Rust (Contrast)* | Built-in `cargo test` | `assert!`, `assert_eq!`, `pretty_assertions` | Trait Fakes / `mockall` |

See: [references/tdd.md](references/tdd.md) and [references/testing.md](references/testing.md)

---

## 4. The SOLID Principles in Object-Oriented Architecture

```
  S - Single Responsibility Principle
  O - Open/Closed Principle
  L - Liskov Substitution Principle
  I - Interface Segregation Principle
  D - Dependency Inversion Principle
```

---

### S — Single Responsibility Principle (SRP)

> *"A class or module should have one, and only one, reason to change (i.e., should be responsible to one, and only one, actor or business stakeholder)."*

#### The Problem It Solves
Monolithic "God Objects" that conflate calculation, data persistence, HTTP transport, and notification delivery. Any change to one concern risks destabilizing the others.

#### OOP Implementation Pattern
Extract multi-purpose classes into cohesive, single-responsibility units:
- **Domain Service / Handler**: Pure business logic and invariants.
- **Repository / Data Gateway**: Persistence layer abstraction.
- **Presenter / Serializer**: Formatting and transport presentation.
- **Notification Client**: External messaging boundary.

```
BAD:
class Order {
    calculateTotal() { ... }
    saveToDatabase() { ... }    // Persistence concern!
    sendConfirmationEmail() { ... } // Communication concern!
    generateInvoicePdf() { ... }   // Presentation concern!
}

GOOD:
- Order: Entity managing order state and invariant validation
- OrderPricingCalculator: Computes totals, taxes, and discounts
- OrderRepository: Handles persistence
- OrderNotificationGateway: Handles email/SMS delivery
- InvoicePdfRenderer: Formats invoice output
```

In **Rust**, SRP manifests by decomposing monolithic structs into distinct structs with focused `impl` blocks, isolating state and behavior.

---

### O — Open/Closed Principle (OCP)

> *"Software entities (classes, modules, functions) should be open for extension, but closed for modification."*

#### The Problem It Solves
Modifying existing, fully tested code every time a new business requirement or type variant is added, requiring risky regressions checks and cascading changes.

#### OOP Implementation Pattern
Design abstractions that allow new behavior to be added through **new classes**, not by editing existing `switch` or `if/else` statements.

```
BAD (Requires editing existing function for every new discount type):
function calculateDiscount(type: string, amount: number): number {
    if (type === "student") return amount * 0.15;
    if (type === "senior")  return amount * 0.20;
    if (type === "vip")     return amount * 0.30; // Editing tested code!
    return 0;
}

GOOD (Open for extension via polymorphism / strategy pattern):
Java / C# / PHP / TypeScript / C++:
- Define an interface/abstract class: DiscountStrategy
- Add new classes: StudentDiscount, SeniorDiscount, VipDiscount
- Context consumes DiscountStrategy polymorphically without modification.
```

In **Rust**, OCP is realized through traits:
```rust
pub trait DiscountStrategy {
    fn calculate(&self, amount: Decimal) -> Decimal;
}
// Add new strategies by implementing DiscountStrategy for new structs in separate modules.
```

---

### L — Liskov Substitution Principle (LSP)

> *"Subtypes must be substitutable for their base types without altering the correctness of the program."*

#### The Problem It Solves
Subclasses that override base methods in ways that violate caller expectations, throw unexpected exceptions (`UnsupportedOperationException`, `NotImplementedError`), or weaken contractual invariants, forcing callers to inspect types with `instanceof` / `is_a`.

#### The Formal Subtyping Contract (Barbara Liskov)
1. **Preconditions Cannot Be Strengthened**: Subtypes cannot demand stricter inputs than their base type.
2. **Postconditions Cannot Be Weakened**: Subtypes must guarantee at least as much as their base type.
3. **Invariants Must Be Preserved**: Internal consistency guarantees of the base type cannot be corrupted.
4. **No Unexpected Throwing**: Subtypes must never throw exceptions that are not part of the base contract.

```
CLASSIC VIOLATION (The Square-Rectangle Problem):
class Rectangle {
    setWidth(w: number) { this.w = w; }
    setHeight(h: number) { this.h = h; }
    getArea(): number { return this.w * this.h; }
}

class Square extends Rectangle {
    // Overriding setWidth to also set height violates Rectangle's invariant:
    // "Setting width leaves height unchanged."
    setWidth(w: number) { this.w = w; this.h = w; }
    setHeight(h: number) { this.w = h; this.h = h; }
}
```

#### Trait & Contract Adaptation (Rust Contrast)
Because Rust does not have classical inheritance, LSP applies to **semantic trait implementation**:
- Any type implementing a trait (e.g., `Iterator`, `Serialize`, `CustomRepository`) must fulfill the documented contract and safety guarantees of that trait.
- A struct must never implement a trait method by invoking `unimplemented!()` or `panic!()` to signal that it does not support an operation defined on that trait. If an operation isn't supported, the trait is too broad (violating ISP).

---

### I — Interface Segregation Principle (ISP)

> *"Clients should not be forced to depend on interfaces they do not use."*

#### The Problem It Solves
"Fat" interfaces with dozens of methods that force implementing classes to provide dummy implementations or throw runtime errors for methods they do not support.

#### OOP Implementation Pattern
Decompose broad interfaces into narrow, focused **Role Interfaces**:

```
BAD (Fat interface):
interface Worker {
    work(): void;
    eatLunch(): void;
    sleep(): void;
}
// A RobotWorker class cannot implement eatLunch() or sleep()!

GOOD (Role interfaces):
interface Workable {
    work(): void;
}
interface Feedable {
    eat(): void;
}
- HumanWorker implements Workable, Feedable
- RobotWorker implements Workable
```

#### Trait & Composition (Rust Contrast)
ISP is the cornerstone of Rust's trait philosophy:
- The Rust standard library is famous for extreme interface segregation: `std::io::Read` has just one required method (`read`), `std::io::Write` has `write` and `flush`.
- Traits are kept atomic, and types compose capabilities via multiple trait implementations (`impl Read for File`, `impl Write for File`).

---

### D — Dependency Inversion Principle (DIP)

> *"High-level modules should not depend on low-level modules. Both should depend on abstractions. Abstractions should not depend on details; details should depend on abstractions."*

#### The Problem It Solves
Tight coupling where business logic directly instantiates and depends on specific databases, HTTP clients, cloud SDKs, or filesystem drivers, making unit testing and technology migration nearly impossible.

#### The Dependency Rule
Source code dependencies must always point **inward** toward the core domain logic:
```
┌────────────────────────────────────────────────────────┐
│  Infrastructure Layer (Database, HTTP, SDKs, Files)    │
│                           │                            │
│                           ▼ (depends on)               │
│  Application Layer (Commands, Queries, Use Cases)      │
│                           │                            │
│                           ▼ (depends on)               │
│  Domain Layer (Entities, Value Objects, Pure Invariants)│
└────────────────────────────────────────────────────────┘
```

#### OOP Implementation Pattern (Constructor Injection)
High-level classes receive abstractions (interfaces or abstract base classes) via their constructors:

- **Java**: `@Autowired` or constructor injection with interfaces.
- **C#**: Primary constructors or constructor injection with `IServiceCollection`.
- **PHP**: Modern constructor property promotion injecting interfaces.
- **Python**: Injecting abstract base classes (`abc.ABC`) or `typing.Protocol` instances.
- **TypeScript**: Constructor injection with interface tokens or lightweight IoC containers.
- **C++**: Injecting `std::shared_ptr<IInterface>` or `std::unique_ptr<IInterface>`.

#### Trait Adaptation (Rust Contrast)
In Rust, high-level modules depend on traits rather than concrete structs:
- **Static Dispatch (Monomorphization)**:
  ```rust
  pub struct OrderService<R: OrderRepository> {
      repository: R,
  }
  ```
- **Dynamic Dispatch (Trait Objects)**:
  ```rust
  pub struct OrderService {
      repository: Box<dyn OrderRepository>,
  }
  ```

See: [references/solid-principles.md](references/solid-principles.md)

---

## 5. Clean Code & Object Calisthenics for OOP

Object Calisthenics provides 9 empirical rules that turn abstract principles into concrete coding habits:

### 1. One Level of Indentation per Method
Extract nested loops and nested conditionals into dedicated, well-named private methods.

### 2. Don't Use the `else` Keyword
Always use early returns, guard clauses, and pattern matching:
```
// BAD:
if (isValid) {
    if (isAuthorized) {
        return performAction();
    } else {
        return unauthorizedError();
    }
} else {
    return validationError();
}

// GOOD:
if (!isValid) return validationError();
if (!isAuthorized) return unauthorizedError();
return performAction();
```

### 3. Wrap All Primitives (Universal Value Objects)
Never use raw primitive types (`int`, `string`, `float`) for domain concepts that have business validation rules (e.g., `EmailAddress`, `Money`, `UserId`, `OrderId`, `ZipCode`).
- **Java**: `record Money(BigDecimal amount, Currency currency) { ... }`
- **C#**: `readonly record struct Money(decimal Amount) { ... }`
- **Python**: `@dataclass(frozen=True) class Money: ...`
- **PHP**: `readonly class Money { public function __construct(private int $amount) { ... } }`
- **C++**: Strongly typed wrapper classes with explicit constructors.
- **TypeScript**: Branded types (`type Money = number & { readonly __brand: unique symbol }`) or immutable classes.
- *Rust*: The Newtype Pattern (`pub struct Money(pub u64);`).

### 4. First-Class Collections
Any class that contains a collection should contain nothing else. Encapsulate filtering, sorting, and transformation inside dedicated collection objects rather than exposing raw mutable lists or arrays.

### 5. One Dot (or Arrow) Per Line (Law of Demeter)
Do not chain method calls across boundaries: `a.getB().getC().doSomething()`. Talk only to immediate dependencies.
*(Note: Fluent builders, LINQ, streams, and method chaining on the same object are permitted).*

### 6. Don't Abbreviate
Choose expressive, domain-driven names. If a name feels too long, the class or method likely has too many responsibilities.

### 7. Keep Entities Small
- Classes: < 150 lines of code.
- Methods: < 20 lines of code.
- Parameters: <= 3 parameters (bundle 4+ parameters into a dedicated Command/Parameter Object).

### 8. No Classes with More Than Two Instance Variables
Favor composite objects and rich value objects over large property bags.

### 9. No Getters / Setters / Properties (Tell, Don't Ask)
Tell objects what behavior to perform rather than querying their state and computing logic outside the object.

See: [references/clean-code.md](references/clean-code.md) and [references/object-design.md](references/object-design.md)

---

## 6. Architecture & Complexity Management

### Vertical Slice Architecture vs. Clean Architecture
- **Vertical Slice Architecture**: Group by feature/business capability (e.g. `Features/Billing/CreateInvoice/`), keeping command, handler, validation, and response together.
- **Clean Architecture / Hexagonal (Ports & Adapters)**:
  - **Inbound Ports**: Entry points into the domain (Controllers, CLI, Handlers).
  - **Domain Core**: Pure business calculations and entity rules with zero infrastructure dependencies.
  - **Outbound Ports**: Contracts for external resources (Repositories, Message Brokers, External APIs).
  - **Adapters**: Concrete infrastructure drivers satisfying outbound ports.

### Managing Complexity
- **YAGNI (You Aren't Gonna Need It)**: Do not author speculative generic frameworks or dynamic abstraction layers until three concrete use cases emerge.
- **Rule of Three**: Wait until code is duplicated three times before abstracting. Early abstraction is far more expensive than duplication.
- **KISS (Keep It Simple, Stupid)**: Prioritize readable, straightforward code over clever metaprogramming or complex reflection.

See: [references/architecture.md](references/architecture.md) and [references/complexity.md](references/complexity.md)

---

## 7. Operational Checklists

### Pre-Implementation Checklist
- [ ] Are domain requirements, invariants, and edge cases clearly defined?
- [ ] Has an automated failing test been drafted before authoring production code?
- [ ] Have raw domain primitives been wrapped in type-safe value objects?
- [ ] Is the proposed class or handler bounded by a single responsibility?

### During-Implementation Checklist
- [ ] Are guard clauses in place with zero `else` keywords?
- [ ] Is indentation restricted to 1 level per method?
- [ ] Does the implementation depend on abstractions/interfaces rather than concrete infrastructure?
- [ ] Are method signatures free of fat parameter lists (<= 3 parameters)?

### Post-Implementation Checklist
- [ ] Do all automated unit and integration tests pass cleanly?
- [ ] Does the compiler/typechecker produce zero errors and zero unaddressed warnings?
- [ ] Are code smells (feature envy, god objects, shotgun surgery) eliminated?
- [ ] Can another engineer understand and safely extend this code without documentation?
