// components/MemoAIChat.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, User, Send, Loader2, AlertCircle } from 'lucide-react';
import { Memo } from '@/types/proto/api/v1/memo_service';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

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
    aiApiUrl?: string;
}

const MemoAIChat: React.FC<MemoAIChatProps> = ({
    memo,
    open,
    onOpenChange,
    aiApiUrl = 'https://memo-ai-proxy.vercel.app'
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
        if (memo.content) {
            return memo.content;
        }

        if (memo.nodes && memo.nodes.length > 0) {
            return memo.nodes
                .map(node => {
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
                    memoContent: messages.length === 0 ? memoContent : undefined,
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
                            console.debug('Parse error for line:', line, e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setError('发送消息时出错，请稍后重试');
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
            const element = scrollAreaRef.current;
            element.scrollTop = element.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] h-[700px] p-0 flex flex-col">
                <DialogHeader className="p-6 pb-0 flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        AI 笔记助手
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col p-6 pt-0 min-h-0">
                    {/* 总结区域 - 限制高度并添加滚动条 */}
                    {(summary || isLoadingSummary) && (
                        <Card className="mb-4 flex-shrink-0">
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
                                    <div 
                                        className="text-sm text-muted-foreground max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
                                        style={{
                                            scrollbarWidth: 'thin',
                                            scrollbarColor: '#9ca3af #e5e7eb'
                                        }}
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeHighlight]}
                                            components={{
                                                // 自定义样式
                                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                                code: ({ inline, children }) => 
                                                    inline ? (
                                                        <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{children}</code>
                                                    ) : (
                                                        <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto">{children}</code>
                                                    ),
                                                ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                                                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                                                li: ({ children }) => <li className="mb-1">{children}</li>,
                                                h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                                                h2: ({ children }) => <h2 className="text-md font-bold mb-2">{children}</h2>,
                                                h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                                            }}
                                        >
                                            {summary}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* 错误提示 */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700 flex-shrink-0">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* 消息列表容器 */}
                    <div className="flex-1 mb-4 relative min-h-0">
                        {/* 消息滚动区域 - 使用灰色滚动条 */}
                        <div 
                            ref={scrollAreaRef}
                            className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 pr-2"
                            style={{
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#9ca3af #e5e7eb'
                            }}
                        >
                            <div className="space-y-4">
                                {messages.length === 0 && (
                                    <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                                        开始与 AI 对话，了解更多关于这篇笔记的内容
                                    </div>
                                )}
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
                                            {message.role === 'user' ? (
                                                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                            ) : (
                                                <div className="text-sm">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm]}
                                                        rehypePlugins={[rehypeHighlight]}
                                                        components={{
                                                            // 针对 AI 消息的样式
                                                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                                            code: ({ inline, children }) => 
                                                                inline ? (
                                                                    <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                                                ) : (
                                                                    <pre className="bg-gray-800 text-gray-100 p-3 rounded mt-2 mb-2 overflow-x-auto">
                                                                        <code className="text-xs font-mono">{children}</code>
                                                                    </pre>
                                                                ),
                                                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                                                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                                                            li: ({ children }) => <li>{children}</li>,
                                                            h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                                                            h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                                                            h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
                                                            blockquote: ({ children }) => (
                                                                <blockquote className="border-l-4 border-gray-300 pl-3 italic my-2 text-gray-700">
                                                                    {children}
                                                                </blockquote>
                                                            ),
                                                            table: ({ children }) => (
                                                                <div className="overflow-x-auto my-2">
                                                                    <table className="min-w-full border-collapse border border-gray-300 text-xs">
                                                                        {children}
                                                                    </table>
                                                                </div>
                                                            ),
                                                            th: ({ children }) => (
                                                                <th className="border border-gray-300 px-2 py-1 bg-gray-50 font-semibold text-left">
                                                                    {children}
                                                                </th>
                                                            ),
                                                            td: ({ children }) => (
                                                                <td className="border border-gray-300 px-2 py-1">
                                                                    {children}
                                                                </td>
                                                            ),
                                                        }}
                                                    >
                                                        {message.content}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
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
                                                <span className="text-sm text-gray-600">正在生成回复...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 输入区域 */}
                    <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0">
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

                {/* 全局样式 - 自定义滚动条 */}
                <style jsx global>{`
                    /* Webkit 滚动条样式 */
                    .scrollbar-thin::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                    }
                    
                    .scrollbar-thumb-gray-400::-webkit-scrollbar-thumb {
                        background-color: #9ca3af;
                        border-radius: 4px;
                    }
                    
                    .scrollbar-thumb-gray-400::-webkit-scrollbar-thumb:hover {
                        background-color: #6b7280;
                    }
                    
                    .scrollbar-track-gray-200::-webkit-scrollbar-track {
                        background-color: #e5e7eb;
                        border-radius: 4px;
                    }
                    
                    .scrollbar-thin::-webkit-scrollbar-corner {
                        background-color: #e5e7eb;
                    }
                `}</style>
            </DialogContent>
        </Dialog>
    );
};

export default MemoAIChat;