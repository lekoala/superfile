import { Window } from "happy-dom";

const window = new Window({
	url: "http://localhost:3000",
});

global.window = window;
global.document = window.document;
global.URL = window.URL;
global.URL.createObjectURL = () => "blob:http://localhost/mock-url";
global.URL.revokeObjectURL = () => {};
global.File = window.File || class File {};
global.FileReader = window.FileReader || class FileReader { readAsDataURL() {} };
global.DataTransfer = window.DataTransfer || class DataTransfer { items = { add() {}, getAsFile() {} }; files = []; };
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.CanvasRenderingContext2D = window.CanvasRenderingContext2D;
global.navigator = window.navigator || { mediaDevices: { getUserMedia: () => Promise.reject() } };

// Fix missing SyntaxError and other globals in happy-dom
window.SyntaxError = SyntaxError;
window.TypeError = TypeError;
window.Error = Error;
window.RegExp = RegExp;
window.Math = Math;
window.Array = Array;
window.Object = Object;
window.String = String;
window.Number = Number;
window.Boolean = Boolean;
window.Date = Date;
window.JSON = JSON;
window.parseInt = parseInt;
window.parseFloat = parseFloat;
window.isNaN = isNaN;
window.isFinite = isFinite;
window.decodeURIComponent = decodeURIComponent;
window.encodeURIComponent = encodeURIComponent;
