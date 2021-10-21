// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ChildProcess, exec } from 'child_process';

enum Theme {
	light,
	dark
}

class DisposableProcess implements vscode.Disposable {
	process: ChildProcess;

	constructor(process: ChildProcess) {
		this.process = process;
	}

	dispose() {
		if (process.exitCode !== undefined) {
			// Already exited
			return;
		}
		process.exit();
	}
}

function setupMonitor(): vscode.Disposable {
	let monitor = exec('gsettings monitor org.gnome.desktop.interface gtk-theme', function (error, stdout, stderr) {
		if (error) {
			console.log(error.stack);
			console.log('Error code: ' + error.code);
			console.log('Signal received: ' + error.signal);
			vscode.window.showErrorMessage('The Theme monitor crashed!', (error.stack as Object).toString());
			throw error;
		}
	});
	monitor.stdout?.addListener("data", async (chunk: String) => {
		console.log(chunk);
		let result = await changeTheme(themeFromGTKTheme(chunk));
		vscode.window.showInformationMessage("Theme changed to " + result + '!');
	});
	return new DisposableProcess(monitor);
}

function getUserThemeMap(): Map<Theme, String> {
	let light = vscode.workspace.getConfiguration().get<String>('gtk-theme.light');
	let dark = vscode.workspace.getConfiguration().get<String>('gtk-theme.dark');
	let result = new Map<Theme, String>();
	result.set(Theme.light, light ?? "Default Light+");
	result.set(Theme.dark, dark ?? "Default Dark+");
	return result;
}

async function changeTheme(target: Theme): Promise<String> {
	let userThemeMap = getUserThemeMap();
	let nextTheme = userThemeMap.get(target);
	if (nextTheme === undefined) {
		throw new Error();
	}
	await vscode.workspace.getConfiguration().update('workbench.colorTheme', nextTheme, vscode.ConfigurationTarget.Global);
	return nextTheme;
}

function themeToString(theme: Theme): String {
	switch (theme) {
		case Theme.light: return 'light';
		case Theme.dark: return 'dark';
	}
}

async function changeTargetTheme(theme: Theme, next: String) {
	if (next === undefined) {
		let result = await vscode.window.showInputBox();
		if (result === undefined || result === "") {
			return;
		}
		next = result;
	}
	await vscode.workspace.getConfiguration().update('gtk-theme.' + themeToString(theme), next, vscode.ConfigurationTarget.Global);
	getCurrentGTKTheme().then(changeTheme);
}

function themeFromGTKTheme(gtkTheme: String): Theme {
	let isDark = gtkTheme.toLowerCase().includes("dark");
	return isDark ? Theme.dark : Theme.light;
}

function getCurrentGTKTheme(): Promise<Theme> {
	return new Promise((resolve, reject) => {
		exec('gsettings get org.gnome.desktop.interface gtk-theme', (error, stdout, stderr) => {
			if (error) {
				console.log(error.stack);
				console.log('Error code: ' + error.code);
				console.log('Signal received: ' + error.signal);
				reject(error);
				return;
			}
			if (stdout) {
				resolve(themeFromGTKTheme(stdout));
				return;
			}
			reject(stderr);
		});
	});
}

function observePrefs(): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration((e) => {
		let shouldUpdate = e.affectsConfiguration('gtk-theme.light')
			|| e.affectsConfiguration('gtk-theme.dark');
		if (shouldUpdate) {
			getCurrentGTKTheme().then(changeTheme);
		}
	});
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let disposables = new Array<vscode.Disposable>();
	getCurrentGTKTheme().then(changeTheme);
	disposables.push(observePrefs());
	disposables.push(setupMonitor());
	disposables.push(vscode.commands.registerCommand("gtk-theme.changeDarkTheme", (next: String) => changeTargetTheme(Theme.dark, next)));
	disposables.push(vscode.commands.registerCommand("gtk-theme.changeLightTheme", (next: String) => changeTargetTheme(Theme.light, next)));

	context.subscriptions.push(...disposables);
}

// this method is called when your extension is deactivated
export function deactivate() { }
