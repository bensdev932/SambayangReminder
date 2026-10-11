# Code Smells & Anti-Patterns across Object-Oriented Ecosystems

## What Are Code Smells?

Code smells are structural symptoms that indicate design weaknesses. While they are not functional bugs, they make software brittle, difficult to reason about, and resistant to change across **Java, C++, C#, PHP, Python, TypeScript**, and **Rust**.

---

## The Five Classic Categories (Martin Fowler & Kent Beck)

### 1. Bloaters (Code That Has Grown Unmanageably Large)

| Smell | Symptom | Refactoring Solution |
| :--- | :--- | :--- |
| **Long Method** | > 20 lines of code | Extract Method / Function |
| **Large Class** | > 150 lines, multiple responsibilities | Extract Class (apply SRP) |
| **Long Parameter List** | > 3 parameters | Introduce Command / Parameter Object |
| **Data Clumps** | Same group of variables always passed together | Introduce Value Object / Struct |
| **Primitive Obsession** | Raw `int`, `string` used for domain concepts | Wrap in Value Object / Newtype |

---

### 2. Object-Orientation Abusers

| Smell | Symptom | Refactoring Solution |
| :--- | :--- | :--- |
| **Switch Statements** | Type checking via `switch` or `if/else` ladders | Polymorphism / Strategy Pattern / Traits |
| **Refused Bequest** | Subclass rejects or overrides parent methods with errors | Replace Inheritance with Composition / ISP |
| **Parallel Inheritance** | Adding a subclass in one tree forces adding a subclass in another | Collapse hierarchy via Delegation |
| **Temporary Field** | Instance field only populated in certain scenarios | Extract Class for specific state |

---

### 3. Change Preventers

| Smell | Symptom | Refactoring Solution |
| :--- | :--- | :--- |
| **Divergent Change** | One class is repeatedly changed for different business reasons | Extract Handlers / Split by Actor (SRP) |
| **Shotgun Surgery** | A single business change requires editing a dozen different files | Consolidate related logic into one cohesive module |

---

### 4. Dispensables (Dead Weight)

| Smell | Symptom | Refactoring Solution |
| :--- | :--- | :--- |
| **Dead Code** | Unreachable methods, unused variables | Delete immediately (version control remembers) |
| **Duplicate Code** | Identical logic copy-pasted across files | Extract common function (Rule of Three) |
| **Speculative Generality** | "Just in case" abstractions and unused hooks | Delete (YAGNI) |
| **Comments Explaining What** | Comments describing what the code is doing | Clean up code naming; reserve comments for *Why* |

---

### 5. Couplers (Excessive Entanglement)

| Smell | Symptom | Refactoring Solution |
| :--- | :--- | :--- |
| **Feature Envy** | Method calls getters of another class more than its own | Move method to the class owning the data |
| **Inappropriate Intimacy** | Two classes know private internal details of each other | Extract interface / encapsulate boundaries |
| **Message Chains** | `a.getB().getC().getD()` traversal | Law of Demeter / Tell, Don't Ask |
| **Middle Man** | Class does nothing except delegate to another object | Remove Middle Man / Inline dependency |
