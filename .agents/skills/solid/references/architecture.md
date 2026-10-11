# Software Architecture in Object-Oriented Engineering

## The Goal of Architecture

Regardless of the technology stack (Java, C++, C#, PHP, Python, TypeScript, or Rust), the goal of architecture is to enable engineering teams to:
1. **Add** features with minimal friction.
2. **Change** existing features safely.
3. **Remove** obsolete features cleanly.
4. **Test** features in isolation from external infrastructure.
5. **Deploy** features reliably with zero regressions.

---

## 1. Architectural Patterns

### Vertical Slice Architecture
Organize by **business capability / feature**, rather than by technical mechanism.

```
BAD (Horizontal Layered Trap):
src/
  controllers/      // Every controller in the entire app
  services/         // Fat services touching dozens of features
  repositories/     // Generic repositories with bloated method lists
  models/           // Global mutable entities

GOOD (Vertical Slice Architecture):
src/
  features/
    patients/
      create-patient/
        CreatePatientCommand.[ext]
        CreatePatientHandler.[ext]
        CreatePatientValidator.[ext]
        CreatePatientEndpoint.[ext]
      get-patient/
        GetPatientQuery.[ext]
        GetPatientHandler.[ext]
    appointments/
      book-appointment/
        BookAppointmentCommand.[ext]
        BookAppointmentHandler.[ext]
```

**Why it works**: High cohesion within features, minimal ripple effects across unrelated application features.

---

### Clean Architecture & Hexagonal (Ports and Adapters)

```
┌────────────────────────────────────────────────────────┐
│  Presentation / Driving Adapters                       │
│  (REST Controllers, GraphQL, CLI, Web Handlers)        │
├────────────────────────────────────────────────────────┤
│  Application Layer                                     │
│  (Use Cases, Commands, Queries, Orchestrators)         │
├────────────────────────────────────────────────────────┤
│  Domain Core (Inward-most)                             │
│  (Entities, Value Objects, Pure Domain Logic)          │
├────────────────────────────────────────────────────────┤
│  Infrastructure / Driven Adapters                      │
│  (SQL Databases, Redis, AWS/GCP SDKs, Message Queues)  │
└────────────────────────────────────────────────────────┘
```

#### The Dependency Rule
Dependencies must **always point inward**:
- The Domain Core imports nothing from the outside world (no HTTP libraries, no database drivers, no UI components).
- The Application Layer defines the interfaces (**Ports**) for persistence, messaging, or external APIs.
- The Infrastructure Layer provides the concrete implementations (**Adapters**).

---

## 2. Ports and Adapters Implementation

### Inbound Ports (Driving)
How users or external systems invoke the application:
- Controllers / HTTP route handlers
- Background workers / Cron consumers
- Command-line interfaces

### Outbound Ports (Driven)
How the application queries or commands external infrastructure:
- **Port** (Interface): `UserRepository`
- **Adapter** (Implementation): `PostgresUserRepository`, `DynamoDbUserRepository`, `InMemoryFakeUserRepository`

---

## 3. Managing Coupling & Complexity

### Package / Module Coupling Metrics
1. **Afferent Coupling ($C_a$)**: How many classes outside this module depend on classes inside it? (Responsibility metric).
2. **Efferent Coupling ($C_e$)**: How many classes inside this module depend on classes outside it? (Dependency metric).
3. **Instability ($I = \frac{C_e}{C_a + C_e}$)**:
   - $I = 0$: Maximally stable (depended upon by many, depends on none — e.g. Domain Core).
   - $I = 1$: Maximally unstable (depends on many, depended upon by none — e.g. Presentation controllers).

### The Stable Dependencies Principle (SDP)
A module should only depend on modules that are **more stable** than itself.
Infrastructure and presentation must depend on the domain, never vice versa.
