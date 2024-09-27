"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNext = void 0;
const checkNext = () => {
    try {
        require.resolve("next");
        return true;
    }
    catch (_a) {
        return false;
    }
};
exports.checkNext = checkNext;
