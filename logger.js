import { fileURLToPath } from 'url';
import fs from 'fs';
import { dirname, join } from 'path';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Logger {
    constructor() {
        this.logdir = join(__dirname, 'logs');
        this.maxFileSize = 20 * 1024 * 1024;
        this.maxFiles = 14;
        if (!fs.existsSync(this.logdir)) {
            fs.mkdir(this.logdir);
        }
    }
    
    getLogFilePath() {
        const date = new Date().toISOString().split('T')[0];
        return join(this.logdir, `app-${date}.log`);
    };
    
    compress(filePath) {
        const input = fs.createReadStream(filePath);
        const gzip = zlib.createGzip();
        const output = fs.createWriteStream(`${filePath}.gz`);
        input.pipe(gzip).pipe(output);
    };
    
    deleteOldLogs() {
        fs.readdir(this.logdir, (error, files) => {
            if (error) throw error;
    
            files.forEach(file => {
                const filePath = join(__dirname, file);
                const lastModified = fs.statSync(filePath).mtimeMs;
    
                if (file.endsWith('.log') && (Date.now() - lastModified) > (14 * 60 * 60 * 24)) {
                    fs.unlink(filePath);
                    const compressed = `${filepath}.gz`;
                    if (fs.existsSyns(compressed)) {
                        fs.unlink(compressed);
                    }
                }
            })
        })
    }
    
    rotateLogs() {
        const filePath = this.getLogFilePath();
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > this.maxFileSize) {
            this.compress(filePath);
            fs.writeFileSync(filePath, '');
            this.deleteOldLogs();
        }
    }

    info(message, req=null) {
        this.rotateLogs();

        const filepath = this.getLogFilePath();
        const entry = {
            timeStamp: new Date().toISOString(),
            message: message,
            request: req
        }
        const entryJSON = JSON.stringify(entry);
        fs.appendFileSync(filepath, entryJSON + '\n', 'utf8');
    }

    error(message, error, stack) {
        this.rotateLogs();
        const filepath = this.getLogFilePath;
        const entry = {
            timeStamp: new Date().toISOString(),
            message: message,
            error: error,
            stack: stack
        }
        const entryJSON = JSON.stringify(entry);
        fs.appendFileSync(filepath, entryJSON + '\n', 'utf8');
    }
}

const logger = new Logger();
export default logger;