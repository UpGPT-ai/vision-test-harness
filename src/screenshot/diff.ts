/**
 * Screenshot diff using pixelmatch.
 */

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'fs';

export interface DiffResult {
  diffPixels: number;
  diffPercent: number;
  totalPixels: number;
  diffImagePath?: string;
}

export async function compareImages(
  baselinePath: string,
  currentPath: string,
  diffOutputPath?: string,
  colorSensitivity = 0.1
): Promise<DiffResult> {
  const baselineData = fs.readFileSync(baselinePath);
  const currentData = fs.readFileSync(currentPath);

  const baseline = PNG.sync.read(baselineData);
  const current = PNG.sync.read(currentData);

  // Pad to same size if dimensions differ
  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);

  const padded1 = new PNG({ width, height });
  const padded2 = new PNG({ width, height });

  padded1.data.fill(0);
  padded2.data.fill(0);

  PNG.bitblt(baseline, padded1, 0, 0, baseline.width, baseline.height, 0, 0);
  PNG.bitblt(current, padded2, 0, 0, current.width, current.height, 0, 0);

  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const diffPixels = pixelmatch(
    padded1.data,
    padded2.data,
    diff.data,
    width,
    height,
    { threshold: colorSensitivity }
  );

  if (diffOutputPath) {
    fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));
  }

  return {
    diffPixels,
    diffPercent: (diffPixels / totalPixels) * 100,
    totalPixels,
    diffImagePath: diffOutputPath,
  };
}
