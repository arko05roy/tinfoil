
## warm pool vs cold boot (M-series Mac, blank tab, 2026-11-17)
- claim from pool: 1–9ms. cold boot: 420–510ms under 10-parallel load (110ms solo).
- 10 at once w/ pool 5: 5 got ~2–9ms, 5 overflowed to cold ~420–510ms → pool size = expected burst size.
