import * as vscode from 'vscode';
import { fetchDua } from './lib/fetchDua';
import { Dua } from './interfaces';

let getDhikrStatusBarButton: vscode.StatusBarItem;
let intervalId: NodeJS.Timeout;
let timeInterval: number;

const showDua = (context: vscode.ExtensionContext) => {
    let dua: Dua = fetchDua(context);
    vscode.window.showInformationMessage(dua.arabic);
};

const setupInterval = (context: vscode.ExtensionContext) => {
    clearInterval(intervalId);
    intervalId = setInterval(() => showDua(context), timeInterval);
};

export function activate(context: vscode.ExtensionContext) {
    // Status Bar Buttons
    getDhikrStatusBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    getDhikrStatusBarButton.command = 'vsadhkar.getDhikr';
    getDhikrStatusBarButton.text = `$(heart) Get Dhikr`;
    getDhikrStatusBarButton.tooltip = "Click to Get a Dhikr";
    context.subscriptions.push(getDhikrStatusBarButton);
    getDhikrStatusBarButton.show();

    vscode.window.showInformationMessage("Free Palestine !");

    // Retrieve saved time interval or use default (30s)
    timeInterval = context.workspaceState.get('vsadhkar.timeInterval', 30000);

    console.log(timeInterval);

    setupInterval(context);

    const disposable = vscode.commands.registerCommand('vsadhkar.getDhikr', () => {
        showDua(context);
    });

    context.subscriptions.push(disposable);

    const provider = new ExampleSidebarProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ExampleSidebarProvider.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsadhkar.openSettings', () => {
            vscode.commands.executeCommand('workbench.view.vsadhkar.exampleSidebar');
        })
    );
}

class ExampleSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vsadhkar.exampleWebview';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'saveSettings':
                    timeInterval = parseInt(message.timeInterval);
                    this._context.workspaceState.update('vsadhkar.timeInterval', timeInterval);
                    vscode.window.showInformationMessage(`Settings saved: Show Dua every ${timeInterval / 1000} seconds`);
                    setupInterval(this._context);
                    // Reload the webview content
                    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const vscodeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'script.js'));
        const palestineFlag = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'palestine.png'));
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <link href="${vscodeStyleUri}" rel="stylesheet">
            <title>VSAdhkar Settings</title>
        </head>
        <body>
            <h1>VSAdhkar Settings</h1>
            <h3>Free Palestine !</h3>
            <img src="${palestineFlag}" />
            
            <a href="https://www.gofundme.com/f/CareForGaza">
                <button>
                    Donate
                </button>
            </a>

            <hr />

            <form id="settingsForm">
                <p>Show Dua every</p>
                <select id="timeInterval">
                    <option value="30000" ${timeInterval === 30000 ? 'selected' : ''}>30s (recommended)</option>
                    <option value="60000" ${timeInterval === 60000 ? 'selected' : ''}>1 min</option>
                    <option value="120000" ${timeInterval === 120000 ? 'selected' : ''}>2 min</option>
                    <option value="180000" ${timeInterval === 180000 ? 'selected' : ''}>3 min</option>
                    <option value="300000" ${timeInterval === 300000 ? 'selected' : ''}>5 min</option>
                    <option value="600000" ${timeInterval === 600000 ? 'selected' : ''}>10 min</option>
                </select>
                <button type="submit">Save</button>
            </form>

            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('settingsForm').addEventListener('submit', event => {
                    event.preventDefault();
                    const timeInterval = document.getElementById('timeInterval').value;
                    vscode.postMessage({
                        command: 'saveSettings',
                        timeInterval: timeInterval
                    });
                });
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}
