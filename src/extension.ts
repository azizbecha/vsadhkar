import * as vscode from 'vscode';
import { fetchDua } from './lib/fetchDua';
import { Dua } from './interfaces';

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

    console.log('Congratulations, your extension "vsadhkar" is now active!');

    let timeInterval: number = 30000; // 30s

    setInterval(() => {
        showDua();
    }, timeInterval);

    const disposable = vscode.commands.registerCommand('vsadhkar.getDhikr', () => {
        showDua();
    });

    context.subscriptions.push(disposable);

    const provider = new ExampleSidebarProvider(context.extensionUri);
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

    constructor(private readonly _extensionUri: vscode.Uri) {}

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
    
        console.log('Resolving webview view...');
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        console.log('Webview HTML set.');
    }
    

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'script.js'));

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>Example Webview</title>
        </head>
        <body>
            <h1>Hello from Webview!</h1>
            <h2>Free Palestine !</h2>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Flag_of_Palestine.svg/640px-Flag_of_Palestine.svg.png" />
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}

export function deactivate() {}
