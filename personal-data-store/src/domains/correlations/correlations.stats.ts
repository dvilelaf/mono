// Lightweight statistics for cross-domain correlation runner.
// All inputs/outputs use plain JS numbers; designed for small N (< ~500) and small p (< ~10).

export interface PearsonResult {
  r: number;
  n: number;
}

export function pearson(x: number[], y: number[]): PearsonResult | null {
  if (x.length !== y.length) return null;
  const n = x.length;
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dxSq = 0, dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dxSq += dx * dx;
    dySq += dy * dy;
  }
  const denom = Math.sqrt(dxSq * dySq);
  if (denom === 0) return { r: 0, n };
  return { r: num / denom, n };
}

export interface OLSResult {
  intercept: number;
  coefficients: number[];   // one per predictor (in input order)
  r2: number;
  n: number;
  p: number;                // number of predictors (excluding intercept)
}

// Solve (XtX) b = Xty via Gauss-Jordan elimination on the augmented matrix.
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

// Multivariate OLS regression of y on X. Adds an intercept automatically.
export function linearRegression(X: number[][], y: number[]): OLSResult | null {
  const n = X.length;
  if (n === 0 || n !== y.length) return null;
  const p = X[0].length;
  if (n <= p + 1) return null; // need n > p+1 for a meaningful fit

  // Augment X with intercept column (1s) on the left.
  const Xa: number[][] = X.map((row) => [1, ...row]);
  const k = p + 1;

  // Compute XtX (k x k) and Xty (k).
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = Xa[i];
    for (let a = 0; a < k; a++) {
      Xty[a] += row[a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += row[a] * row[b];
    }
  }

  const beta = solveLinearSystem(XtX, Xty);
  if (!beta) return null;

  // Compute R^2.
  let yMean = 0;
  for (let i = 0; i < n; i++) yMean += y[i];
  yMean /= n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let a = 0; a < k; a++) yhat += beta[a] * Xa[i][a];
    ssRes += (y[i] - yhat) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    intercept: beta[0],
    coefficients: beta.slice(1),
    r2,
    n,
    p,
  };
}
