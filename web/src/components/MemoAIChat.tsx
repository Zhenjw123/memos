// components/MemoAIChat.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, User, Send, Loader2, AlertCircle } from 'lucide-react';
import { Memo } from '@/types/proto/api/v1/memo_service';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

interface MemoAIChatProps {
    memo: Memo;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    aiApiUrl?: string; // AI 代理服务的 URL
}

const MemoAIChat: React.FC<MemoAIChatProps> = ({
    memo,
    open,
    onOpenChange,
    aiApiUrl = window.location.hostname === 'localhost' ? '/api/ai' : 'https://memo-ai-proxy.vercel.app'
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [summary, setSummary] = useState<string>('');
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [error, setError] = useState<string>('');
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    // 提取 memo 的文本内容
    const extractMemoContent = (memo: Memo): string => {
        // 根据你的 memo 结构提取内容，这里假设有 content 字段
        // 你可能需要根据实际的 memo 数据结构调整这个函数
        if (memo.content) {
            return memo.content;
        }

        // 如果使用 nodes 结构，需要遍历提取文本
        if (memo.nodes && memo.nodes.length > 0) {
            return memo.nodes
                .map(node => {
                    // 根据 node 类型提取文本，这里需要根据你的实际结构调整
                    if (node.type === 'TEXT' && node.textNode) {
                        return node.textNode.content;
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
        }

        return '';
    };

    // 生成笔记总结
    const generateSummary = async () => {
        setIsLoadingSummary(true);
        setError('');

        try {
            const memoContent = extractMemoContent(memo);
            if (!memoContent.trim()) {
                setSummary('这篇笔记似乎没有文本内容可以总结。');
                return;
            }

            // 如果是本地开发环境，使用模拟数据
            if (window.location.hostname === 'localhost') {
                // 模拟网络延迟
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 生成简单的总结
                const words = memoContent.split(/\s+/).filter(Boolean);
                const summary = `这篇笔记包含 ${words.length} 个词。主要内容围绕: ${words.slice(0, 10).join(' ')}${words.length > 10 ? '...' : ''}。这是一个模拟的AI总结，实际使用时会调用真实的AI服务。`;
                setSummary(summary);
                return;
            }

            const response = await fetch(`${aiApiUrl}/api/summarize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: memoContent }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setSummary(data.summary || '无法生成总结');
        } catch (error) {
            console.error('Error generating summary:', error);
            setError('生成总结时出错，请稍后重试');
            setSummary('');
        } finally {
            setIsLoadingSummary(false);
        }
    };

    // 发送消息到 AI
    const sendMessage = async (messageContent: string) => {
        if (!messageContent.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: messageContent,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError('');

        try {
            const memoContent = extractMemoContent(memo);

            // 如果是本地开发环境，使用模拟响应
            if (window.location.hostname === 'localhost') {
                // 模拟网络延迟
                await new Promise(resolve => setTimeout(resolve, 1000));

                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: '',
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, assistantMessage]);

                // 模拟流式响应
                const responses = [
                    "这是一个很好的问题！",
                    "根据您的笔记内容，",
                    "我认为主要重点在于...",
                    "您是否还想了解更多关于这个话题的信息？",
                    "\n\n（这是模拟的AI响应，实际使用时会调用真实的AI服务）"
                ];

                for (const response of responses) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setMessages(prev =>
                        prev.map(msg =>
                            msg.id === assistantMessage.id
                                ? { ...msg, content: msg.content + response }
                                : msg
                        )
                    );
                }
                return;
            }

            const messagesForAPI = messages.concat(userMessage).map(msg => ({
                role: msg.role,
                content: msg.content,
            }));

            const response = await fetch(`${aiApiUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: messagesForAPI,
                    memoContent: messages.length === 0 ? memoContent : undefined, // 只在第一次发送memo内容
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('No response body');
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: '',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);

            // 流式读取响应
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('0:')) {
                        try {
                            // 处理格式：0:"content"
                            const content = line.slice(2);
                            const parsed = JSON.parse(content);
                            if (parsed) {
                                setMessages(prev =>
                                    prev.map(msg =>
                                        msg.id === assistantMessage.id
                                            ? { ...msg, content: msg.content + parsed }
                                            : msg
                                    )
                                );
                            }
                        } catch (e) {
                            // 忽略解析错误，继续处理下一行
                            console.debug('Parse error for line:', line, e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setError('发送消息时出错，请稍后重试');
            // 移除失败的用户消息
            setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
        } finally {
            setIsLoading(false);
        }
    };

    // 当对话框打开时生成总结
    useEffect(() => {
        if (open && !summary && !isLoadingSummary) {
            generateSummary();
        }
    }, [open]);

    // 自动滚动到底部
    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl h-[700px] p-0">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        AI 笔记助手
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col h-full p-6 pt-0">
                    {/* 总结区域 */}
                    {(summary || isLoadingSummary) && (
                        <Card className="mb-4">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">笔记总结</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                {isLoadingSummary ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        正在生成总结...
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{summary}</p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* 错误提示 */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* 消息列表 */}
                    <ScrollArea className="flex-1 mb-4" ref={scrollAreaRef}>
                        <div className="space-y-4">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'
                                        }`}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                            <Bot className="w-4 h-4 text-blue-600" />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[80%] p-3 rounded-lg ${message.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 text-gray-900'
                                            }`}
                                    >
                                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                    </div>
                                    {message.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                            <User className="w-4 h-4 text-gray-600" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex items-start gap-3 justify-start">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                        <Bot className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div className="bg-gray-100 p-3 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="text-sm text-gray-600">正在思考...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    {/* 输入区域 */}
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                            placeholder="询问关于这篇笔记的任何问题..."
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button type="submit" disabled={isLoading || !input.trim()}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MemoAIChat;