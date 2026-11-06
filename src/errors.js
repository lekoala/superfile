/**
 * Internal factory: keep native Error/TypeError behavior and diagnostic messages.
 * @param {import('../superfile.js').SuperfileErrorCode} code
 * @param {string} message
 * @param {ErrorConstructor} [ErrorType]
 * @param {unknown} [cause]
 */
export function libraryError(code, message, ErrorType = Error, cause) {
	const error = Object.assign(new ErrorType(message), { code });
	if (cause !== undefined) Object.assign(error, { cause });
	return error;
}

/** @param {string} message */
export function configurationError(message) {
	return libraryError("CONFIGURATION", message, TypeError);
}
