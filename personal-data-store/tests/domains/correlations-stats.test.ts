import { describe, it, expect } from "vitest";
import { pearson, linearRegression } from "../../src/domains/correlations/correlations.stats.js";

describe("correlation stats", () => {
  it("computes Pearson r for a perfectly correlated series", () => {
    const result = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(result).not.toBeNull();
    expect(result!.r).toBeCloseTo(1, 6);
    expect(result!.n).toBe(5);
  });

  it("computes Pearson r for inverse correlation", () => {
    const result = pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(result!.r).toBeCloseTo(-1, 6);
  });

  it("returns null when series lengths differ", () => {
    expect(pearson([1, 2], [1, 2, 3])).toBeNull();
  });

  it("fits a univariate OLS line", () => {
    // y = 3 + 2x exactly
    const X = [[1], [2], [3], [4]];
    const y = [5, 7, 9, 11];
    const ols = linearRegression(X, y);
    expect(ols).not.toBeNull();
    expect(ols!.intercept).toBeCloseTo(3, 6);
    expect(ols!.coefficients[0]).toBeCloseTo(2, 6);
    expect(ols!.r2).toBeCloseTo(1, 6);
  });

  it("fits a bivariate OLS plane", () => {
    // y = 1 + 2*x1 + 3*x2
    const X = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    const y = X.map(([a, b]) => 1 + 2 * a + 3 * b);
    const ols = linearRegression(X, y);
    expect(ols).not.toBeNull();
    expect(ols!.intercept).toBeCloseTo(1, 6);
    expect(ols!.coefficients[0]).toBeCloseTo(2, 6);
    expect(ols!.coefficients[1]).toBeCloseTo(3, 6);
    expect(ols!.r2).toBeCloseTo(1, 6);
  });

  it("returns null when n is too small", () => {
    expect(linearRegression([[1], [2]], [1, 2])).toBeNull();
  });
});
