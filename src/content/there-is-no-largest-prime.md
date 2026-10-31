---
title: There is no largest prime
description: Euclid's two-thousand-year-old proof, and why it still feels like a magic trick.
date: 2026-10-12
---

Some proofs are long and heavy. This one fits on a napkin, and it has been convincing people for about 2,300 years. It comes from Euclid's *Elements*, and it answers a simple question: do the primes ever run out?

## The setup

A **prime** is a whole number greater than 1 whose only divisors are 1 and itself: 2, 3, 5, 7, 11, 13, and so on. Every whole number greater than 1 is either prime or a product of primes. That second fact, the [fundamental theorem of arithmetic](https://en.wikipedia.org/wiki/Fundamental_theorem_of_arithmetic), is the only tool we need.

## The proof

Suppose, for contradiction, that there are only finitely many primes. Call them p<sub>1</sub>, p<sub>2</sub>, …, p<sub>n</sub>.

1. Multiply them all together and add one: N = p<sub>1</sub> × p<sub>2</sub> × ⋯ × p<sub>n</sub> + 1.
2. Dividing N by any p<sub>i</sub> leaves a remainder of 1, so no prime on our list divides N.
3. But N is greater than 1, so *some* prime divides it.

That prime isn't on the list, so the list wasn't complete. No finite list of primes can ever be complete.

> The proof doesn't build a new prime. It only shows that one must exist, somewhere just out of sight.

## A common misreading

It's tempting to think N itself is always prime. It isn't. Try it:

```python
from math import prod

primes = [2, 3, 5, 7, 11, 13]
n = prod(primes) + 1
print(n)  # 30031 = 59 × 509
```

30031 isn't prime, but its factors, 59 and 509, are both missing from our list. That's exactly what the proof promised.

## Why I like it

- It uses almost nothing: multiplication, remainders, and one well-known fact.
- It turns "show me infinitely many things" into "show me one thing you forgot."
- It's the first proof by contradiction most people ever meet, and it's still one of the best.

---

Primes get rarer as numbers grow, but they never stop. Euclid showed that with one multiplication and a plus sign.
