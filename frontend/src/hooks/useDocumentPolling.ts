import { useCallback, useRef } from "react";
import { fetchDocumentStatus, DocumentInfo } from "@/lib/api";

const MAX_RETRIES = 60; // 60 × 3s = 3 minutes max

export function useDocumentPolling(
    setDocuments: React.Dispatch<React.SetStateAction<DocumentInfo[]>>,
    setErrorMsg: (msg: string) => void,
) {
    // Track active timers so we can clean them up
    const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const stopPolling = useCallback((collectionName: string) => {
        const timer = timerRefs.current.get(collectionName);
        if (timer !== undefined) {
            clearTimeout(timer);
            timerRefs.current.delete(collectionName);
        }
    }, []);

    const pollDocumentStatus = useCallback(
        (collectionName: string) => {
            let retries = 0;

            const scheduleNext = (delay: number) => {
                const timer = setTimeout(poll, delay);
                timerRefs.current.set(collectionName, timer);
            };

            const poll = async () => {
                if (retries >= MAX_RETRIES) {
                    setDocuments((prev) =>
                        prev.map((d) =>
                            d.collection_name === collectionName ? { ...d, status: "error" } : d,
                        ),
                    );
                    setErrorMsg("文件處理逾時，請重新上傳。");
                    stopPolling(collectionName);
                    return;
                }
                retries++;

                try {
                    const statusData = await fetchDocumentStatus(collectionName);
                    if (statusData.status === "ready") {
                        setDocuments((prev) =>
                            prev.map((d) =>
                                d.collection_name === collectionName
                                    ? {
                                          ...d,
                                          status: "ready",
                                          total_pages: statusData.total_pages,
                                          total_chunks: statusData.total_chunks,
                                      }
                                    : d,
                            ),
                        );
                        stopPolling(collectionName);
                    } else if (statusData.status === "error") {
                        setDocuments((prev) =>
                            prev.map((d) =>
                                d.collection_name === collectionName ? { ...d, status: "error" } : d,
                            ),
                        );
                        setErrorMsg(`文件處理失敗：${statusData.error_message}`);
                        stopPolling(collectionName);
                    } else {
                        scheduleNext(3000);
                    }
                } catch {
                    scheduleNext(5000);
                }
            };

            scheduleNext(3000);
        },
        [setDocuments, setErrorMsg, stopPolling],
    );

    const stopAllPolling = useCallback(() => {
        timerRefs.current.forEach((timer) => clearTimeout(timer));
        timerRefs.current.clear();
    }, []);

    return { pollDocumentStatus, stopAllPolling };
}
