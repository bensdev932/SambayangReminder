# Testing Strategy across Object-Oriented Ecosystems

## The Testing Pyramid

```
       /\
      /  \        End-to-End / Functional Tests (Few)
     /----\       - Full application lifecycle & HTTP pipeline
    /      \      - Real database or containerized dependencies
   /--------\
  /          \    Integration Tests (Some)
 /------------\   - Persistence queries, API contract tests
/              \  - Medium speed, verifies boundaries
----------------
      Unit Tests (Many)
      - Single class, handler, or domain entity
      - In-memory, sub-millisecond, zero network or disk I/O
```

---

## 1. Unit Tests

Test one cohesive class, method, or domain entity in isolation.

**Characteristics:**
- In-memory execution (sub-millisecond speed).
- Zero database, disk, or network I/O.
- External dependencies substituted using test doubles (fakes, stubs, mocks).
- Forms the base (70–80%) of the automated test suite.

---

## 2. Test Doubles: Terminology (Gerard Meszaros)

1. **Dummy**: Objects passed around but never actually used (e.g., parameter fillers).
2. **Stub**: Provides canned answers to calls made during the test.
3. **Spy**: Records information about how it was called (e.g., call count, arguments).
4. **Mock**: Pre-programmed with expectations of calls it should receive, verifying behavior.
5. **Fake**: Working implementation with a shortcut (e.g., an in-memory repository using a hash map).

> **Best Practice**: Prefer **In-Memory Fakes** over complex Mock frameworks where feasible. Fakes honor the LSP contract and make tests less brittle to internal refactorings.

---

## 3. Structure: Arrange-Act-Assert (AAA)

Every test must follow a clear 3-phase flow:

```
// 1. Arrange: Set up inputs, state, and test doubles
// 2. Act: Execute the single behavior under test
// 3. Assert: Verify the expected state changes or return values
```
