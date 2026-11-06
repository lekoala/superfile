// Content signatures shared by image processing and EXIF policy. A signature
// identifies a candidate container; decoding/inspection still validates it.
export function detectImageType(bytes) {
	const matches = (offset, values) =>
		values.every((value, index) => bytes[offset + index] === value);
	if (matches(0, [255, 216])) return "image/jpeg";
	if (matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
	if (matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80]))
		return "image/webp";
	return null;
}
