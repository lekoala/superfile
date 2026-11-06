// One native-submit coordinator per form, independent of HTTP transports.
const forms = new WeakMap();
const documents = new WeakMap();

function coordinator(form) {
	let state = forms.get(form);
	if (state) return state;
	state = { instances: new Set(), pending: null };
	state.cancel = () => {
		state.pending = null;
	};
	state.submit = (event) => {
		if (event.defaultPrevented) return;
		const submitter = event.submitter;
		// Named controls can shadow form.method. An empty override means GET,
		// rather than falling back to a possible method="dialog" on the form.
		const method =
			submitter?.getAttribute("formmethod") ??
			form.getAttribute("method") ??
			"get";
		if (method.toLowerCase() === "dialog") {
			state.cancel();
			return;
		}
		const active = () =>
			[...state.instances].filter((sf) => !sf.input.matches(":disabled"));
		if (!state.pending && active().every((sf) => sf.state === "ready")) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (state.pending || active().some((sf) => sf.state === "error")) return;
		const intent = { submitter };
		state.pending = intent;
		(async () => {
			try {
				do {
					await Promise.all(active().map((sf) => sf.whenReady()));
					if (state.pending !== intent || !form.isConnected) return;
				} while (active().some((sf) => sf.state !== "ready"));
				state.pending = null;
				if (submitter && (!submitter.isConnected || submitter.form !== form))
					return;
				const request =
					form.ownerDocument.defaultView.HTMLFormElement.prototype
						.requestSubmit;
				request.call(form, submitter || undefined);
			} catch {
				if (state.pending === intent) state.pending = null;
			}
		})();
	};
	state.reset = (event) => {
		queueMicrotask(() => {
			if (event.defaultPrevented) return;
			state.cancel();
			for (const sf of state.instances) sf.clear();
		});
	};
	form.addEventListener("submit", state.submit, true);
	form.addEventListener("reset", state.reset, true);
	forms.set(form, state);
	return state;
}

export function syncForm(sf) {
	const form = sf.input.form;
	if (sf._form && !sf._form.isConnected) cancelSubmission(sf);
	if (form === sf._form) return;
	detachForm(sf);
	sf._form = form;
	if (form) coordinator(form).instances.add(sf);
}

export function detachForm(sf) {
	const form = sf._form;
	if (!form) return;
	const state = forms.get(form);
	state.cancel();
	state.instances.delete(sf);
	if (!state.instances.size) {
		form.removeEventListener("submit", state.submit, true);
		form.removeEventListener("reset", state.reset, true);
		forms.delete(form);
	}
	sf._form = null;
}

export function cancelSubmission(sf) {
	forms.get(sf._form)?.cancel();
}

export function watchForm(sf) {
	const doc = sf.input.ownerDocument;
	let record = documents.get(doc);
	if (!record) {
		record = { instances: new Set() };
		record.sync = () => {
			for (const instance of record.instances) syncForm(instance);
		};
		record.observer = new doc.defaultView.MutationObserver(record.sync);
		doc.addEventListener("submit", record.sync, true);
		record.observer.observe(doc, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["form", "id"],
		});
		documents.set(doc, record);
	}
	record.instances.add(sf);
	syncForm(sf);
	return () => {
		detachForm(sf);
		record.instances.delete(sf);
		if (!record.instances.size) {
			record.observer.disconnect();
			doc.removeEventListener("submit", record.sync, true);
			documents.delete(doc);
		}
	};
}
