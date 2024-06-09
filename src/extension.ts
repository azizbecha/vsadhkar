// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { fetchDua } from './lib/fetchDua';
import { Dua } from './interfaces';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

let getDhikrStatusBarButton: vscode.StatusBarItem;


const showDua = () => {
	let dua: Dua = fetchDua();
	vscode.window.showInformationMessage(dua.arabic);
};

export function activate(context: vscode.ExtensionContext) {

	// Status Bar Buttons
	getDhikrStatusBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	getDhikrStatusBarButton.command = 'vsadhkar.getDhikr';
	getDhikrStatusBarButton.text = `$(heart) Get Dhikr`;
	getDhikrStatusBarButton.tooltip = "Click to Get a Dhikr";
	context.subscriptions.push(getDhikrStatusBarButton);
	getDhikrStatusBarButton.show();

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vsadhkar" is now active!');

	let timeInterval: number = 30000; // 30s

	setInterval(() => {
		showDua();
	}, timeInterval);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vsadhkar.getDhikr', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		showDua();
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
