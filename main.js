let worker;

document.addEventListener('DOMContentLoaded', () => {
    worker = new Worker('worker.js');
    
    document.getElementById('imageInput').addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        buildFileTree(files);
        log(`تعداد ${files.length} عکس آپلود شد.`);
    });
    
    document.getElementById('startBtn').addEventListener('click', () => {
        const files = document.getElementById('imageInput').files;
        if (files.length === 0) {
            log('خطا: هیچ عکسی آپلود نشده است.');
            return;
        }
        
        const settings = {
            outputName: document.getElementById('outputName').value || 'manhwa_output',
            width: parseInt(document.getElementById('widthInput').value),
            height: parseInt(document.getElementById('heightInput').value),
            quality: parseInt(document.getElementById('qualityInput').value) / 100,
            format: document.getElementById('formatSelect').value,
            totalFiles: files.length
        };
        
        log('شروع پردازش تصاویر...');
        updateProgress(0);
        
        // Send files and settings to worker
        const fileArray = Array.from(files);
        worker.postMessage({ files: fileArray, settings });
    });
    
    document.getElementById('resetBtn').addEventListener('click', () => {
        log('ریست کردن تمام تنظیمات و فایل‌ها.');
        resetUI();
    });
    
    worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'log') {
            log(data);
        } else if (type === 'progress') {
            updateProgress(data);
        } else if (type === 'result') {
            const { zipBlob, fileName } = data;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = `${fileName}.zip`;
            link.click();
            URL.revokeObjectURL(link.href);
            log('دانلود فایل ZIP با موفقیت انجام شد.');
        }
    };
    
    worker.onerror = (error) => {
        log(`خطا در پردازش: ${error.message}`);
    };
});
