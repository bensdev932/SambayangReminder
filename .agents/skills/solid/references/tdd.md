# Test-Driven Development (TDD) across Languages & Paradigms

## The Core Loop

```
┌─────────────────────────────────────────────────────────────┐
│ 1. RED      ➔ Write a failing test specifying domain intent │
│ 2. GREEN    ➔ Write the minimal code to pass the test       │
│ 3. REFACTOR ➔ Clean design under a green test suite         │
└─────────────────────────────────────────────────────────────┘
```

### 1. RED Phase
Write a failing test describing domain behavior:
- Express the business requirement in domain language.
- Describe WHAT the system does, not HOW it is implemented.
- Use concrete examples with boundary cases.

### 2. GREEN Phase
Write the **simplest possible code** to make the test pass:
1. **Fake It**: Return a hardcoded value to verify the plumbing.
2. **Triangulate**: Add a second or third test case to force the generalized algorithm.
3. **Obvious Implementation**: If the solution is trivial and obvious, implement it directly.

### 3. REFACTOR Phase
Under the safety of passing tests, improve design:
- Eliminate duplication.
- Extract cohesive helper methods.
- Apply guard clauses and remove `else` statements.
- Wrap raw primitives into strongly typed value objects / newtypes.
- Introduce interfaces, traits, or protocols where extension points are needed.

---

## The Three Laws of TDD (Robert C. Martin)

1. **No production code** may be authored without a failing unit test.
2. **No more test code** may be authored than is sufficient to fail (and compilation failure is a test failure).
3. **No more production code** may be authored than is sufficient to pass the single failing test.

---

## TDD Across Ecosystems

| Language | Test Runner | Assertion Syntax |
| :--- | :--- | :--- |
| **Java** | `JUnit 5` | `assertThat(result).isEqualTo(expected);` |
| **C++** | `GoogleTest` / `Catch2` | `EXPECT_EQ(result, expected);` |
| **C#** | `xUnit` | `result.Should().Be(expected);` |
| **PHP** | `PHPUnit` / `Pest` | `$this->assertEquals($expected, $result);` |
| **Python** | `pytest` | `assert result == expected` |
| **TypeScript** | `Vitest` / `Jest` | `expect(result).toBe(expected);` |
| **Rust** | `cargo test` | `assert_eq!(result, expected);` |
