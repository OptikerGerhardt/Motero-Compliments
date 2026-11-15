// Adapted from Crop to Margin by Wael Itani (MIT); see LICENSE.
// Added background/confidence fields; detection logic is preserved.
export function inkBox(imageData, threshold = 24, minInk = 2) {
		let width = imageData.width;
		let height = imageData.height;
		let source = imageData.data;
		let data;
		try {
			data = new Uint8ClampedArray(source.length);
			data.set(source);
		}
		catch (e) {
			data = source;
		}

		let luminance = new Uint8Array(width * height);
		let histogram = new Uint32Array(256);
		for (let i = 0, p = 0; p < luminance.length; p++, i += 4) {
			let value = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000 | 0;
			luminance[p] = value;
			histogram[value]++;
		}
		let background = 0;
		for (let value = 1; value < 256; value++) {
			if (histogram[value] > histogram[background]) background = value;
		}

		let rowInk = new Uint32Array(height);
		let colInk = new Uint32Array(width);
		for (let y = 0, p = 0; y < height; y++) {
			for (let x = 0; x < width; x++, p++) {
				if (Math.abs(luminance[p] - background) > threshold) {
					rowInk[y]++;
					colInk[x]++;
				}
			}
		}

		let bounds = (counts) => {
			let lo = -1;
			let hi = -1;
			for (let i = 0; i < counts.length; i++) {
				if (counts[i] >= minInk) {
					if (lo === -1) lo = i;
					hi = i;
				}
			}
			return lo === -1 ? null : [lo, hi + 1];
		};
		let vertical = bounds(rowInk);
		let horizontal = bounds(colInk);
		if (!vertical || !horizontal) return null;
		return { x0: horizontal[0], x1: horizontal[1], y0: vertical[0], y1: vertical[1], background, backgroundShare: histogram[background] / (width * height) };
	}
