import { fileURLToPath } from 'url';
import fs from 'fs';
import { dirname, join } from 'path';
import zlib from 'zlib';

// get var for current dir
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @class Logger
 * @desscription Handles info and error message logging
 */
class Logger {
    constructor() {
        this.logdir = join(__dirname, 'logs');
        this.maxFileSize = 20 * 1024 * 1024;
        this.maxFiles = 14;
        if (!fs.existsSync(this.logdir)) {
            fs.mkdir(this.logdir);
        }
    }
    
    /**
     * @method getLogFilePath
     * @description returns filepath, in logs file, for the file according to the date
     * @returns {String} filepath of current file by date
     */
    getLogFilePath() {
        const date = new Date().toISOString().split('T')[0];
        return join(this.logdir, `app-${date}.log`);
    };
    
    /**
     * @method compress
     * @description compresses the current data of the file and creates new .gz file
     * @param {String} filePath path of the file that will be compressed
     */
    compress(filePath) {
        const input = fs.createReadStream(filePath);
        const gzip = zlib.createGzip();
        const output = fs.createWriteStream(`${filePath}.gz`);
        input.pipe(gzip).pipe(output);
    };
    
    /**
     * @method deleteOldLogs
     * @description scans logs dir for old files and deletes both .log and .gz files
     */
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
    
    /**
     * @method rotateLogs
     * @description rotates current log file and removes any old files
     */
    rotateLogs() {
        const filePath = this.getLogFilePath();
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > this.maxFileSize) {
            this.compress(filePath);
            fs.writeFileSync(filePath, '');
            this.deleteOldLogs();
        }
    }

    /**
     * @method info
     * @description adds info message to logs
     * @param {String} message
     * @param {Object} req dictionary containing all the queries from the client
     */
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

    /**
     * @method error
     * @description adds error entry to logs
     * @param {String} message 
     * @param {String} error external caught error message
     * @param {Object} stack 
     */
    error(message, error, stack) {
        this.rotateLogs();
        const filepath = this.getLogFilePath();
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