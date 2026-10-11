# Design Patterns in Object-Oriented Software

## What Are Design Patterns?

Design patterns represent proven structural patterns for solving recurring design challenges across **Java, C++, C#, PHP, Python, TypeScript**, and **Rust**.

> **Crucial Rule**: Never force patterns upfront. Let patterns emerge organically through refactoring under the safety of automated unit tests.

---

## 1. Creational Patterns

### Factory Method
- **Purpose**: Encapsulate object creation without exposing concrete instantiation details.
- **When to Use**: When creation logic involves complex branching or environment-dependent types.

### Builder Pattern
- **Purpose**: Construct complex objects incrementally.
- **When to Use**: Constructing objects with dozens of optional configurations, and building test data fixtures in unit tests without combinatorial constructor explosion.

---

## 2. Structural Patterns

### Adapter Pattern
- **Purpose**: Bridge incompatible interfaces without altering existing source code.
- **When to Use**: Integrating third-party vendor SDKs or legacy systems into your clean domain boundaries (Ports and Adapters).

### Decorator / Middleware Pattern
- **Purpose**: Attach additional responsibilities (logging, metrics, caching, retries) to an object dynamically without subclassing.
- **When to Use**: Request/response pipelines, HTTP middleware, cross-cutting concerns.

---

## 3. Behavioral Patterns

### Strategy Pattern (Core OCP Enabler)
- **Purpose**: Define a family of algorithms, encapsulate each one in a separate class, and make them interchangeable at runtime.
- **When to Use**: Replacing `switch` / `if-else` ladders for discount calculations, tax rules, payment providers, or sorting algorithms.

### Observer / Pub-Sub Pattern
- **Purpose**: Notify multiple subscribed dependents of state changes without tight coupling.
- **When to Use**: Decoupling domain side-effects (e.g. sending a welcome email when a user registers) via domain events.
