/* global ePub, acquireVsCodeApi */
const vscode = acquireVsCodeApi();

let rendition, book, currentBookUri;

const openButton = document.getElementById('open');
openButton.addEventListener('click', () => {
  console.log('webview: open click -> posting openFile');
  openButton.disabled = true; // avoid multiple clicks client-side
  vscode.postMessage({ command: 'openFile' });
});
// navigation
const btnPrev = document.createElement('button');
btnPrev.textContent = '◀';
btnPrev.id = 'prev';
const btnNext = document.createElement('button');
btnNext.textContent = '▶';
btnNext.id = 'next';
document.getElementById('toolbar').insertBefore(btnNext, document.getElementById('book-title'));
document.getElementById('toolbar').insertBefore(btnPrev, document.getElementById('book-title'));
btnPrev.addEventListener('click', () => rendition && rendition.prev());
btnNext.addEventListener('click', () => rendition && rendition.next());

const openSidebarButton = document.getElementById('openSidebar');
if (openSidebarButton) {
  openSidebarButton.addEventListener('click', () => {
    console.log('webview: openSidebar click -> posting openInSidebar');
    vscode.postMessage({ command: 'openInSidebar' });
  });
}

window.addEventListener('message', event => {
  const message = event.data;
  // Only log explicit extension messages to avoid noise from internal libraries
  if (message && (message.command === 'loadBook' || message.command === 'status')) {
    console.log('webview: message received', message);
  }
  switch (message.command) {
    case 'loadBook':
      loadBook(message.book, message.lastLocation);
      break;
    case 'status':
      if (message.status === 'opening') {
        openButton.disabled = true;
      } else if (message.status === 'ready') {
        openButton.disabled = false;
      }
      break;
  }
});

async function loadBook(bookMsg, lastLocation) {
  currentBookUri = bookMsg.path;
  document.getElementById('book-title').textContent = bookMsg.name;

  // Convert base64 to Uint8Array
  const binary = atob(bookMsg.base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (rendition) {
    rendition.destroy();
    rendition = null;
  }
  book = ePub(bytes.buffer);
  const viewer = document.getElementById('viewer');
  viewer.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'epub-container';
  viewer.appendChild(container);
  rendition = book.renderTo(container, { width: '100%', height: '100%' });
  rendition.display();

  if (lastLocation) {
    try { rendition.display(lastLocation); } catch (err) { console.warn(err); }
  }

  rendition.on('relocated', (loc) => {
    const cfi = loc.start.cfi;
    vscode.postMessage({ command: 'saveLocation', location: cfi, path: currentBookUri });
  });

  book.on('book:error', (err) => {
    console.error('book:error', err);
    displayError(err);
  });
  book.on('error', (err) => {
    console.error('book:error', err);
    displayError(err);
  });


function displayError(err) {
  const viewer = document.getElementById('viewer');
  viewer.innerHTML = '<div class="epub-error">Erro ao abrir EPUB: ' + (err && err.message ? err.message : String(err)) + '</div>';
}
  // Keyboard navigation for convenience
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') rendition && rendition.prev();
    if (e.key === 'ArrowRight') rendition && rendition.next();
  });
}
