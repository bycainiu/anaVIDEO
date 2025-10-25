import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { AnalyzedVideo } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface Node {
    id: string;
    radius: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
}
interface Edge {
    source: string;
    target: string;
    strength: number;
}

interface KeywordGraphProps {
    analyzedVideos: AnalyzedVideo[];
    onNodeClick: (keyword: string | null) => void;
    activeNode: string | null;
}

const KeywordGraph: React.FC<KeywordGraphProps> = ({ analyzedVideos, onNodeClick, activeNode }) => {
    const { language } = useLanguage();
    const svgRef = useRef<SVGSVGElement>(null);
    const [nodes, setNodes] = useState<Record<string, Node>>({});
    const [edges, setEdges] = useState<Edge[]>([]);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const simulationRunningRef = useRef(false);

    // Memoize graph data processing
    const graphData = useMemo(() => {
        const keywordCounts: Record<string, number> = {};
        const coOccurrences: Record<string, number> = {};

        analyzedVideos.forEach(video => {
            // 防御性检查：确保 analysis 和 frameAnalyses 存在
            if (!video?.analysis?.frameAnalyses || !Array.isArray(video.analysis.frameAnalyses)) {
                return;
            }

            const videoKeywords = new Set<string>();
            video.analysis.frameAnalyses.forEach(frame => {
                // 只使用当前语言的关键词
                const keywords = frame?.keywords?.[language] || [];
                const expandedKeywords = frame?.expandedKeywords?.[language] || [];
                const frameKeywords = [...keywords, ...expandedKeywords];
                frameKeywords.forEach(kw => {
                    if (kw && typeof kw === 'string' && kw.trim()) {
                        videoKeywords.add(kw.trim());
                    }
                });
            });
            const uniqueVideoKeywords = Array.from(videoKeywords);
            uniqueVideoKeywords.forEach(kw => {
                keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
            });
            for (let i = 0; i < uniqueVideoKeywords.length; i++) {
                for (let j = i + 1; j < uniqueVideoKeywords.length; j++) {
                    const key = [uniqueVideoKeywords[i], uniqueVideoKeywords[j]].sort().join('||');
                    coOccurrences[key] = (coOccurrences[key] || 0) + 1;
                }
            }
        });

        // 根据视频数量动态调整显示数量
        const videoCount = analyzedVideos.length;
        const maxKeywords = Math.min(30, Math.max(10, videoCount * 3)); // 10-30个关键词
        const minCount = Math.max(2, Math.ceil(videoCount * 0.2)); // 至少出现在20%视频中
        
        const filteredKeywords = Object.keys(keywordCounts)
            .filter(kw => keywordCounts[kw] >= minCount)
            .sort((a, b) => keywordCounts[b] - keywordCounts[a])
            .slice(0, maxKeywords); // 动态数量
        
        const newNodes: Record<string, Node> = {};
        const nodeCount = filteredKeywords.length;
        
        if (nodeCount === 0) {
            return { nodes: newNodes, edges: [] };
        }
        
        // 使用螺旋分布，让节点更均匀分散
        const centerX = dimensions.width / 2;
        const centerY = dimensions.height / 2;
        const maxRadius = Math.min(dimensions.width, dimensions.height) * 0.45; // 扩大分布范围
        
        filteredKeywords.forEach((kw, index) => {
            const t = index / Math.max(1, nodeCount - 1);
            const angle = t * 6 * Math.PI; // 3圈螺旋，更分散
            const radius = maxRadius * Math.sqrt(t); // 平方根分布
            
            // 添加随机偏移增加自然感
            const jitter = 20;
            const offsetX = (Math.random() - 0.5) * jitter;
            const offsetY = (Math.random() - 0.5) * jitter;
            
            newNodes[kw] = {
                id: kw,
                radius: Math.max(8, Math.min(20, 8 + keywordCounts[kw] * 2)),
                x: centerX + Math.cos(angle) * radius + offsetX,
                y: centerY + Math.sin(angle) * radius + offsetY,
                vx: 0,
                vy: 0,
            };
        });

        const newEdges: Edge[] = [];
        Object.entries(coOccurrences).forEach(([key, strength]) => {
            const [source, target] = key.split('||');
            // 只保留强关联（至少共同出现2次以上）
            if (newNodes[source] && newNodes[target] && strength >= 2) {
                newEdges.push({ source, target, strength });
            }
        });
        
        return { nodes: newNodes, edges: newEdges };

    }, [analyzedVideos, language, dimensions.width, dimensions.height]);
    
    // Update graph data when memoized data changes
    useEffect(() => {
        setNodes(graphData.nodes);
        setEdges(graphData.edges);
        simulationRunningRef.current = false; // 重置仿真状态
    }, [graphData]);

    // Physics Simulation
    useEffect(() => {
        if (!dimensions.width || !dimensions.height || Object.keys(nodes).length === 0) return;
        if (simulationRunningRef.current) return; // 防止重复启动
        
        simulationRunningRef.current = true;
        let animationFrameId: number;
        const simulationSteps = 300; // 增加步数让布局更稳定
        let currentStep = 0;

        const simulationLoop = () => {
            if (currentStep >= simulationSteps) {
                simulationRunningRef.current = false;
                return;
            }
            
            setNodes(currentNodes => {
                const nextNodes: Record<string, Node> = JSON.parse(JSON.stringify(currentNodes));
                const nodeArr = Object.values(nextNodes);

                // 计算衰减因子，让动画逐渐平稳
                const alpha = Math.max(0.01, 1 - currentStep / simulationSteps);
                
                // Apply forces
                // 1. Repulsion force between all nodes
                for (let i = 0; i < nodeArr.length; i++) {
                    for (let j = i + 1; j < nodeArr.length; j++) {
                        const a = nodeArr[i];
                        const b = nodeArr[j];
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                        const minDistance = (a.radius + b.radius) * 5; // 进一步增大间距
                        const force = distance < minDistance ? -1000 / (distance * distance) : 0;
                        const fx = force * (dx / distance) * alpha;
                        const fy = force * (dy / distance) * alpha;
                        a.vx += fx; a.vy += fy;
                        b.vx -= fx; b.vy -= fy;
                    }
                }
                // 2. Attraction force for edges
                edges.forEach(edge => {
                    const source = nextNodes[edge.source];
                    const target = nextNodes[edge.target];
                    if (!source || !target) return;
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const idealDistance = 120; // 增大连接节点间的理想距离
                    const force = 0.03 * (distance - idealDistance) * Math.min(edge.strength, 3) * alpha;
                    const fx = force * (dx / distance);
                    const fy = force * (dy / distance);
                    source.vx += fx; source.vy += fy;
                    target.vx -= fx; target.vy -= fy;
                });
                
                // 3. Center gravity (更弱的引力)
                nodeArr.forEach(node => {
                    const dx = dimensions.width / 2 - node.x;
                    const dy = dimensions.height / 2 - node.y;
                    node.vx += dx * 0.001 * alpha;
                    node.vy += dy * 0.001 * alpha;
                });

                // Update positions
                const damping = 0.85; // 增强阻尼
                Object.values(nextNodes).forEach(node => {
                    node.vx *= damping;
                    node.vy *= damping;
                    
                    // 速度限制
                    const maxSpeed = 5;
                    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
                    if (speed > maxSpeed) {
                        node.vx = (node.vx / speed) * maxSpeed;
                        node.vy = (node.vy / speed) * maxSpeed;
                    }
                    
                    node.x += node.vx;
                    node.y += node.vy;
                    
                    // Boundary check with padding
                    const padding = node.radius + 20;
                    node.x = Math.max(padding, Math.min(dimensions.width - padding, node.x));
                    node.y = Math.max(padding, Math.min(dimensions.height - padding, node.y));
                });
                return nextNodes;
            });
            
            currentStep++;
            animationFrameId = requestAnimationFrame(simulationLoop);
        };
        
        simulationLoop();
        return () => {
            cancelAnimationFrame(animationFrameId);
            simulationRunningRef.current = false;
        };

    }, [edges, dimensions.width, dimensions.height]);

    // Resize observer
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });
        resizeObserver.observe(svg);
        return () => resizeObserver.disconnect();
    }, []);

    const hoveredAndConnected = useMemo(() => {
        const connected = new Set<string>();
        if (hoveredNode) {
            connected.add(hoveredNode);
            edges.forEach(edge => {
                if (edge.source === hoveredNode) connected.add(edge.target);
                if (edge.target === hoveredNode) connected.add(edge.source);
            });
        }
        return connected;
    }, [hoveredNode, edges]);

    return (
        <svg ref={svgRef} width="100%" height="100%">
            <g>
                {edges.map((edge, i) => {
                    const source = nodes[edge.source];
                    const target = nodes[edge.target];
                    if (!source || !target) return null;
                    const isHovered = hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode);
                    return (
                        <line
                            key={`${edge.source}-${edge.target}-${i}`}
                            x1={source.x} y1={source.y}
                            x2={target.x} y2={target.y}
                            stroke={isHovered ? "#3b82f6" : "#4b5563"}
                            strokeWidth={isHovered ? 2 : Math.min(3, edge.strength / 2)}
                            strokeOpacity={isHovered ? 1 : 0.5}
                        />
                    );
                })}
            </g>
             <g>
                {Object.values(nodes).map(node => {
                    const isHovered = hoveredNode === node.id;
                    const isConnected = hoveredAndConnected.has(node.id);
                    const isActive = activeNode === node.id;
                    let opacity = 0.3;
                    if (!hoveredNode && !activeNode) opacity = 1;
                    if (isActive) opacity = 1;
                    if (hoveredNode && isConnected) opacity = 1;

                    return (
                        <g 
                            key={node.id}
                            transform={`translate(${node.x},${node.y})`}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                            onClick={() => onNodeClick(activeNode === node.id ? null : node.id)}
                            className="cursor-pointer group"
                            style={{ opacity }}
                        >
                            <circle
                                r={node.radius}
                                fill={isActive ? "#2563eb" : isHovered ? "#3b82f6" : "#4b5563"}
                                stroke={isActive ? "#60a5fa" : isHovered ? "#60a5fa" : "#6b7280"}
                                strokeWidth="2"
                            />
                            <text
                                textAnchor="middle"
                                y={node.radius + 14}
                                fontSize="11"
                                fill="#d1d5db"
                                className="font-medium pointer-events-none group-hover:fill-white select-none"
                                style={{ 
                                    textShadow: '0 0 3px rgba(0,0,0,0.8)',
                                    letterSpacing: language === 'en' ? '0.5px' : '1px'
                                }}
                            >
                                {node.id}
                            </text>
                        </g>
                    )
                })}
            </g>
        </svg>
    );
};

export default KeywordGraph;