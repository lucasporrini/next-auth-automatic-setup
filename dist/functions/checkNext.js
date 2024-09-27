export const checkNext = () => {
    try {
        require.resolve("next");
        return true;
    }
    catch {
        return false;
    }
};
