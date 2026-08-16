import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyExpense } from "./classifyExpense.js";
import { SEED_EXPENSES } from "./seed.js";

test("classifies the sample trip titles the same way the seed does", () => {
  for (const exp of SEED_EXPENSES) {
    const guess = classifyExpense(exp.description);
    assert.equal(
      guess.category,
      exp.category,
      `"${exp.description}" → ${guess.category} (matched ${guess.matched}), seed is ${exp.category}`,
    );
  }
});

test("live demo phrases a judge might type", () => {
  assert.equal(classifyExpense("Grab to the airport").category, "transport");
  assert.equal(classifyExpense("Uber from hotel").category, "transport");
  assert.equal(classifyExpense("Dinner at the hotel").category, "food");
  assert.equal(classifyExpense("Dinner in Chinatown").category, "food");
  assert.equal(classifyExpense("3 nights Airbnb").category, "accommodation");
  assert.equal(classifyExpense("Spa day").category, "activities");
  assert.equal(classifyExpense("Museum tickets").category, "activities");
  assert.equal(classifyExpense("???").category, "general");
  assert.equal(classifyExpense("").category, "general");
});

test("airport hotel prefers stay over transport", () => {
  assert.equal(classifyExpense("Airport hotel").category, "accommodation");
});

test("incomplete titles classify as soon as the word is unique", () => {
  const gra = classifyExpense("Gra");
  assert.equal(gra.category, "transport");
  assert.equal(gra.partial, true);
  assert.equal(gra.matched, "grab");
  assert.equal(classifyExpense("Din").category, "food");
  assert.equal(classifyExpense("Hote").category, "accommodation");
  assert.equal(classifyExpense("Spa").category, "activities");
});

test("ambiguous prefixes stay general until a unique word appears", () => {
  assert.equal(classifyExpense("par").category, "general");
  assert.equal(classifyExpense("hot").category, "general");
  assert.equal(classifyExpense("air").category, "general");
});

test("ride-hail plus a meal word is food, not transport", () => {
  assert.equal(classifyExpense("Grab lunch").category, "food");
  assert.equal(classifyExpense("Uber eats").category, "food");
  assert.equal(classifyExpense("Grab to the airport").category, "transport");
});
