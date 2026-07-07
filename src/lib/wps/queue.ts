type QueueTask<T> = () => Promise<T>;

export class WpsQueueManager {
    // 存储每个 Webhook URL 当前的 Promise 链
    private static queues = new Map<string, Promise<unknown>>();
    // 存储当前排队的请求数
    private static activeCounts = new Map<string, number>();

    /**
     * 获取指定 Webhook URL 的当前排队/运行任务数
     */
    static getActiveCount(webhookUrl: string): number {
        return this.activeCounts.get(webhookUrl) || 0;
    }

    /**
     * 判断指定 Webhook URL 是否处于空闲状态
     */
    static isIdle(webhookUrl: string): boolean {
        return this.getActiveCount(webhookUrl) === 0;
    }

    /**
     * 将 WPS Webhook 调用任务加入队列串行执行
     * @param webhookUrl Webhook 的唯一 URL 作为队列的 Key
     * @param task 执行 fetch 调用的异步函数
     */
    static async enqueue<T>(webhookUrl: string, task: QueueTask<T>): Promise<T> {
        const currentCount = this.activeCounts.get(webhookUrl) || 0;
        this.activeCounts.set(webhookUrl, currentCount + 1);

        if (currentCount > 0) {
            console.log(`[WPS Queue] Webhook ${webhookUrl} 正在运行，当前任务进入队列排队，排队位置: ${currentCount}`);
        }

        // 获取该 Webhook 的前驱任务 Promise，若没有则立即执行
        const previousPromise = this.queues.get(webhookUrl) || Promise.resolve();

        // 串联新的 Promise
        const nextPromise = (async () => {
            try {
                // 等待上一个任务执行完毕（无论成功或失败）
                await previousPromise;
            } catch {
                // 忽略前驱任务的错误，不影响当前任务执行
            }
            return await task();
        })();

        // 更新该 Webhook 的最新队列末端
        this.queues.set(webhookUrl, nextPromise);

        try {
            return await nextPromise;
        } finally {
            // 任务执行结束，清理计数
            const countAfter = this.activeCounts.get(webhookUrl) || 1;
            if (countAfter <= 1) {
                this.activeCounts.delete(webhookUrl);
            } else {
                this.activeCounts.set(webhookUrl, countAfter - 1);
            }

            // 如果当前 Promise 仍为该队列的末端，则从 Map 中移除以释放内存
            if (this.queues.get(webhookUrl) === nextPromise) {
                this.queues.delete(webhookUrl);
            }
        }
    }
}
