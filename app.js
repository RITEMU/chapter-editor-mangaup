// لیست فایل‌ها
let files = [];
const treePanel = document.getElementById('treePanel');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const logBox = document.getElementById('logBox');

// آپلود فایل‌ها
fileInput.addEventListener('change', (e) => {
    files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    updateTreePanel();
});

// به‌روزرسانی پنل درختی
function updateTreePanel() {
    treePanel.innerHTML = '';
    files.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'tree-item p-2 flex justify-between items-center';
        div.dataset.index = index;
        div.innerHTML = `
            <span>${file.name}</span>
            <div>
                <button onclick="moveItem(${index}, 'up')" class="text-green-500 mr-2"><i class="fas fa-arrow-up"></i></button>
                <button onclick="moveItem(${index}, 'down')" class="text-red-500"><i class="fas fa-arrow-down"></i></button>
            </div>
        `;
        treePanel.appendChild(div);
    });
    // اضافه کردن قابلیت مرتب‌سازی با drag-and-drop
    new Sortable(treePanel, {
        animation: 150,
        onEnd: (evt) => {
            const [removed] = files.splice(evt.oldIndex, 1);
            files.splice(evt.newIndex, 0, removed);
            updateTreePanel();
        }
    });
}

// جابجایی آیتم‌ها
function moveItem(index, direction) {
    if (direction === 'up' && index > 0) {
        [files[index], files[index - 1]] = [files[index - 1], files[index]];
    } else if (direction === 'down' && index < files.length - 1) {
        [files[index], files[index + 1]] = [files[index + 1], files[index]];
    }
    updateTreePanel();
}

// لاگ کردن
function log(message) {
    logBox.innerHTML += message + '<br>';
    logBox.scrollTop = logBox.scrollHeight;
}

// شروع عملیات
startBtn.addEventListener('click', () => {
    if (files.length === 0) {
        log('خطا: هیچ فایلی آپلود نشده است.');
        return;
    }

    const width = parseInt(document.getElementById('widthInput').value);
    const height = parseInt(document.getElementById('heightInput').value);
    const quality = parseInt(document.getElementById('qualityInput').value);
    const format = document.getElementById('formatSelect').value;
    const outputName = document.getElementById('outputName').value || 'chapter_output';

    log('شروع پردازش تصاویر...');

    // ایجاد Web Worker
    const worker = new Worker('worker.js');
    worker.postMessage({
        files: files,
        width: width,
        height: height,
        quality: quality / 100,
        format: format,
        outputName: outputName
    });

    // دریافت پیام از Worker
    worker.onmessage = (e) => {
        const { type, message, data } = e.data;
        if (type === 'log') {
            log(message);
        } else if (type === 'result') {
            const link = document.createElement('a');
            link.href = data.url;
            link.download = data.name;
            link.click();
            log('دانلود فایل خروجی با موفقیت انجام شد.');
        }
    };

    worker.onerror = (error) => {
        log('خطا در پردازش: ' + error.message);
    };
});

// ریست کردن
resetBtn.addEventListener('click', () => {
    files = [];
    treePanel.innerHTML = '';
    fileInput.value = '';
    logBox.innerHTML = '';
    log('ریست انجام شد.');
});
