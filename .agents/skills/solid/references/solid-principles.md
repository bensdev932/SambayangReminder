# SOLID Principles in Object-Oriented Software Engineering

## Overview

SOLID principles reduce coupling, increase cohesion, and maximize testability across Object-Oriented languages (**Java, C++, C#, PHP, Python, TypeScript**), while adapting to composition-and-trait architectures in systems languages like **Rust**.

---

## S — Single Responsibility Principle (SRP)

> *"A class or module should have one, and only one, reason to change (one actor or stakeholder)."*

### Problem It Solves
Monolithic "God Objects" that conflate calculation, persistence, network transport, and formatting, making the codebase brittle, slow to test, and prone to regression cascades.

### How to Apply
Each class or module encapsulates ONE business responsibility. If describing what a class does requires saying "and", decompose it.

```typescript
// BAD: Multiple responsibilities conflated in one class
class Order {
  calculateTotal(): number { /* pricing calculation */ }
  async saveToDatabase(): Promise<void> { /* persistence */ }
  generateInvoicePdf(): Buffer { /* presentation */ }
  async sendConfirmationEmail(): Promise<void> { /* notification */ }
}

// GOOD: Single responsibility decomposed into cohesive collaborators
class Order {
  constructor(readonly id: string, readonly items: readonly OrderItem[]) {}
}

class OrderPricingCalculator {
  calculateTotal(order: Order): Money { /* pricing domain rules */ }
}

interface OrderRepository {
  save(order: Order): Promise<void>;
}

interface InvoiceRenderer {
  renderPdf(order: Order): Buffer;
}

interface NotificationGateway {
  sendOrderConfirmation(order: Order): Promise<void>;
}
```

### The Rust Adaptation
In Rust, SRP decomposes large structs into separate domain types and dedicated traits:
```rust
pub struct Order {
    pub id: OrderId,
    pub items: Vec<OrderItem>,
}

pub struct OrderPricingCalculator;
impl OrderPricingCalculator {
    pub fn calculate_total(&self, order: &Order) -> Money { /* ... */ }
}

pub trait OrderRepository {
    fn save(&self, order: &Order) -> Result<(), RepositoryError>;
}
```

---

## O — Open/Closed Principle (OCP)

> *"Software entities should be open for extension, but closed for modification."*

### Problem It Solves
Having to edit, re-test, and redeploy existing stable classes every time a new business rule, calculation variant, or third-party provider is added.

### How to Apply
Rely on polymorphism, interfaces/abstract base classes, or strategies. Add new capabilities by authoring **new classes**, not by appending branches to existing functions.

```python
# BAD: Modifying existing logic whenever a new payment method is introduced
class PaymentProcessor:
    def process(self, payment_type: str, amount: Decimal):
        if payment_type == "credit_card":
            # credit card logic
            pass
        elif payment_type == "paypal":
            # paypal logic
            pass
        elif payment_type == "crypto": # Modifying existing code!
            # crypto logic
            pass
        else:
            raise ValueError(f"Unsupported payment: {payment_type}")

# GOOD: Open for extension via Polymorphism / Protocol (Python)
from typing import Protocol

class PaymentMethod(Protocol):
    def charge(self, amount: Decimal) -> TransactionResult: ...

class CreditCardPayment:
    def charge(self, amount: Decimal) -> TransactionResult: ...

class PayPalPayment:
    def charge(self, amount: Decimal) -> TransactionResult: ...

class CryptoPayment: # Added without touching PaymentProcessor!
    def charge(self, amount: Decimal) -> TransactionResult: ...

class PaymentProcessor:
    def process(self, method: PaymentMethod, amount: Decimal) -> TransactionResult:
        return method.charge(amount)
```

### The Rust Adaptation
New behavior is added by implementing existing traits on new structs:
```rust
pub trait PaymentMethod {
    fn charge(&self, amount: Money) -> Result<TransactionResult, PaymentError>;
}

pub struct CreditCardPayment;
impl PaymentMethod for CreditCardPayment {
    fn charge(&self, amount: Money) -> Result<TransactionResult, PaymentError> { /* ... */ }
}
```

---

## L — Liskov Substitution Principle (LSP)

> *"Subtypes must be substitutable for their base types without altering program correctness or violating contracts."*

### Problem It Solves
Subclasses that alter expectations, demand stricter inputs, weaken output guarantees, or throw unexpected exceptions (`UnsupportedOperationException`, `NotImplementedError`), forcing client code to use `instanceof` / `is_a` checks.

### Rules of Behavioral Subtyping (Barbara Liskov)
1. **Preconditions cannot be strengthened** in a subtype.
2. **Postconditions cannot be weakened** in a subtype.
3. **Invariants of the supertype must be preserved**.
4. **Historical constraints / exception contracts must be honored**.

```java
// CLASSIC VIOLATION: Square extending Rectangle
public class Rectangle {
    protected int width;
    protected int height;

    public void setWidth(int w) { this.width = w; }
    public void setHeight(int h) { this.height = h; }
    public int getArea() { return this.width * this.height; }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(int w) {
        this.width = w;
        this.height = w; // Violates Rectangle's invariant: "changing width leaves height unchanged"
    }

    @Override
    public void setHeight(int h) {
        this.width = h;
        this.height = h;
    }
}

// Client expectation broken:
void verifyArea(Rectangle r) {
    r.setWidth(5);
    r.setHeight(10);
    // If r is a Square, getArea() is 100 instead of 50! Fails LSP.
    assert r.getArea() == 50;
}
```

### The Rust Adaptation
Since Rust does not feature classical class inheritance, LSP applies to **semantic trait implementation**:
- Any struct implementing a trait must honor that trait's semantic guarantees.
- A struct must **never** implement a trait method by invoking `unimplemented!()` or `panic!()` to signal an unsupported operation. If a type cannot support a method, the trait is too broad and violates ISP.

---

## I — Interface Segregation Principle (ISP)

> *"Clients should not be forced to depend on interfaces they do not consume."*

### Problem It Solves
Fat, bloated interfaces that bundle disparate behaviors together, forcing implementers to provide empty stubs or dummy throws for unneeded methods.

### How to Apply
Split monolithic interfaces into focused, cohesive **Role Interfaces**.

```php
<?php
// BAD: Fat interface forcing incomplete implementation
interface WarehouseWorker {
    public function assembleOrder(string $orderId): void;
    public function driveForklift(): void;
    public function auditFinances(): void;
}

class JuniorPicker implements WarehouseWorker {
    public function assembleOrder(string $orderId): void { /* works */ }
    public function driveForklift(): void { throw new \BadMethodCallException(); } // Forced stub!
    public function auditFinances(): void { throw new \BadMethodCallException(); } // Forced stub!
}

// GOOD: Role interfaces
interface OrderPicker {
    public function assembleOrder(string $orderId): void;
}

interface ForkliftOperator {
    public function driveForklift(): void;
}

class JuniorPicker implements OrderPicker {
    public function assembleOrder(string $orderId): void { /* clean and focused */ }
}
```

### The Rust Adaptation
ISP is natively embedded in Rust standard library design. Rust standard traits are deliberately tiny and composed via trait bounds:
- `std::io::Read` (requires `read`)
- `std::io::Write` (requires `write`, `flush`)
- Functions take only what they need:
  ```rust
  fn log_data<W: std::io::Write>(writer: &mut W, data: &[u8]) -> std::io::Result<()> {
      writer.write_all(data)
  }
  ```

---

## D — Dependency Inversion Principle (DIP)

> *"High-level modules should not depend on low-level modules. Both should depend on abstractions. Abstractions should not depend on details; details should depend on abstractions."*

### Problem It Solves
Hardcoded dependencies where domain logic directly instantiates databases, HTTP clients, cloud SDKs, or disk I/O, preventing unit testing and creating tight technological lock-in.

### How to Apply
The domain defines the **interface/port** it needs. Infrastructure adapters implement the interface. Dependencies are supplied via **Constructor Injection**.

```csharp
// BAD: High-level OrderService directly instantiates low-level infrastructure
public class OrderService
{
    private readonly SqlServerOrderDatabase _db = new(); // Hardcoded low-level dependency!
    public void PlaceOrder(Order order) => _db.Insert(order);
}

// GOOD: High-level OrderService depends on an abstraction
public interface IOrderRepository
{
    Task SaveAsync(Order order, CancellationToken ct = default);
}

public class OrderService(IOrderRepository repository)
{
    public async Task PlaceOrderAsync(Order order, CancellationToken ct = default)
    {
        await repository.SaveAsync(order, ct);
    }
}
```

### The Rust Adaptation
In Rust, DIP is fulfilled through traits:
- **Static Dispatch**:
  ```rust
  pub struct OrderService<R: OrderRepository> {
      repository: R,
  }
  ```
- **Dynamic Dispatch (Trait Object)**:
  ```rust
  pub struct OrderService {
      repository: Box<dyn OrderRepository>,
  }
  ```

---

## Applying SOLID at Architecture Level

| Principle | Architecture Level Application |
| :--- | :--- |
| **SRP** | Each bounded context or microservice owns one domain model. |
| **OCP** | Pluggable architectures: add new plugins/adapters without modifying the core orchestrator. |
| **LSP** | Swappable backends (e.g. In-Memory Fake vs Postgres Adapter) honoring identical contract test suites. |
| **ISP** | Micro-interfaces between services (narrow GraphQL schemas, focused gRPC RPC definitions). |
| **DIP** | Clean / Hexagonal Architecture: core domain depends on nothing; infrastructure depends on core. |

---

## Quick Reference Summary

| Principle | Core Directive | Red Flag Smell |
| :--- | :--- | :--- |
| **SRP** | One reason to change | Class description contains "and", multiple unrelated imports |
| **OCP** | Open to extension, closed to edit | `switch(type)` / `if/else` ladders when introducing variants |
| **LSP** | Subtypes preserve base contracts | `instanceof` / `is_a` checks, throwing "NotSupported" |
| **ISP** | Narrow, focused role interfaces | Dummy method stubs, empty overrides, throwing exceptions |
| **DIP** | Depend on abstractions, not concretions | `new ConcreteService()` or direct DB/HTTP imports in domain |
