import { useEffect, useState, useRef } from 'react';
import { ForceGraph2D } from 'react-force-graph';
import survivorData from '../data/survivor_data.json';

const SurvivorGraph = () => {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [isCondensed, setIsCondensed] = useState(true);
    const [viewMode, setViewMode] = useState('player'); // 'player' or 'season'
    const [nodeImages, setNodeImages] = useState(new Map());
    const [seasonLogoImages, setSeasonLogoImages] = useState(new Map());
    const [searchTerm, setSearchTerm] = useState('');
    const [pathSearchTerm, setPathSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [pathSearchResults, setPathSearchResults] = useState([]);
    const [searchDropdownPosition, setSearchDropdownPosition] = useState({ top: 0, left: 0 });
    const [pathDropdownPosition, setPathDropdownPosition] = useState({ top: 0, left: 0 });
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isPathSearchFocused, setIsPathSearchFocused] = useState(false);
    const searchInputRef = useRef(null);
    const pathSearchInputRef = useRef(null);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [pathStartPlayer, setPathStartPlayer] = useState(null);
    const [pathEndPlayer, setPathEndPlayer] = useState(null);
    const [shortestPaths, setShortestPaths] = useState(null);
    const graphRef = useRef();
    const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const simulationRef = useRef(null);
    
    // Fixed optimal values for graph parameters
    const BASE_NODE_SIZE = 6;  // Smaller base size for single-season players
    const SEASON_NODE_SIZE = 12;  // Bigger size for season nodes
    const MAX_PLAYER_NODE_SIZE = SEASON_NODE_SIZE;  // Cap player node size at season node size
    const MIN_LINK_DISTANCE = SEASON_NODE_SIZE * 30;
    const CHARGE_STRENGTH = -500;
    const COLLISION_DISTANCE = SEASON_NODE_SIZE * 15;
    const BORDER_WIDTH = 0.5; // Normal border width
    const HIGHLIGHT_BORDER_WIDTH = 1; // Selected node border width
    const HIGHLIGHT_GLOW_SIZE = 1; // Size of the highlight glow

    // Helper function to calculate node size based on seasons played
    const getNodeSize = (node) => {
        if (node.isSeasonNode) {
            return viewMode === 'season' ? SEASON_NODE_SIZE / 2 : SEASON_NODE_SIZE;
        }
        const numSeasons = node.seasons.length;
        // Scale size linearly with number of seasons, but cap at MAX_PLAYER_NODE_SIZE
        return Math.min(BASE_NODE_SIZE + (numSeasons - 1) * 2, MAX_PLAYER_NODE_SIZE);
    };

    // Track mouse position for tooltip
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    
    // Add mouse move handler
    useEffect(() => {
        const handleMouseMove = (event) => {
            setMousePos({ x: event.clientX, y: event.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    // Preload images
    useEffect(() => {
        const loadImages = async () => {
            setIsLoading(true);
            const images = new Map();
            const logoImages = new Map();

            // Load player images
            for (const [name, data] of Object.entries(survivorData.players)) {
                // Only load images for multi-season players
                if (data.image_url && data.seasons.length > 1) {
                    const img = new Image();
                    img.src = data.image_url;
                    await new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve; // Skip failed loads
                    });
                    images.set(name, img);
                }
            }

            // Load season logos
            for (const [season, logo_url] of Object.entries(survivorData.season_logos)) {
                const img = new Image();
                img.src = logo_url;
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve; // Skip failed loads
                });
                logoImages.set(parseInt(season), img);
            }

            setNodeImages(images);
            setSeasonLogoImages(logoImages);
            setIsLoading(false);
        };
        loadImages();
    }, []);

    useEffect(() => {
        // Convert survivor data to graph format
        const processData = () => {
            if (viewMode === 'season') {
                // Process data for season view
                const nodes = [];
                const links = [];
                const seasonMap = new Map(); // Map to store players by season
                
                // First, collect all seasons and their players
                Object.entries(survivorData.players).forEach(([name, data]) => {
                    data.seasons.forEach(season => {
                        if (!seasonMap.has(season)) {
                            seasonMap.set(season, new Set());
                        }
                        seasonMap.get(season).add(name);
                    });
                });

                // Create nodes for each season
                Array.from(seasonMap.keys()).sort((a, b) => a - b).forEach(season => {
                    nodes.push({
                        id: `Season ${season}`,
                        name: `Season ${season}`,
                        season: season,
                        isSeasonNode: true,
                        playerCount: seasonMap.get(season).size,
                        logo_url: survivorData.season_logos[season]
                    });
                });

                // Create links between seasons that share players
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const seasonA = nodes[i].season;
                        const seasonB = nodes[j].season;
                        const playersA = seasonMap.get(seasonA);
                        const playersB = seasonMap.get(seasonB);
                        
                        // Find shared players
                        const sharedPlayers = Array.from(playersA).filter(player => playersB.has(player));
                        
                        if (sharedPlayers.length > 0) {
                            links.push({
                                source: nodes[i].id,
                                target: nodes[j].id,
                                value: sharedPlayers.length,
                                players: sharedPlayers
                            });
                        }
                    }
                }

                setGraphData({ nodes, links });
            } else {
                // Original player view processing
                const singleSeasonPlayers = new Map();
                const multiSeasonPlayers = new Set();

                // First pass: identify single and multi-season players
                Object.entries(survivorData.players).forEach(([name, data]) => {
                    const seasons = data.seasons;
                    if (seasons.length > 1) {
                        multiSeasonPlayers.add(name);
                    } else {
                        const season = seasons[0];
                        if (!singleSeasonPlayers.has(season)) {
                            singleSeasonPlayers.set(season, []);
                        }
                        singleSeasonPlayers.get(season).push(name);
                    }
                });

                // Create nodes
                const nodes = [];
                
                // Add multi-season players as individual nodes
                multiSeasonPlayers.forEach(name => {
                    const playerData = survivorData.players[name];
                    nodes.push({
                        id: name,
                        name: name,
                        seasons: playerData.seasons,
                        image_url: playerData.image_url
                    });
                });

                // Add season nodes or individual nodes based on condensed state
                if (isCondensed) {
                    singleSeasonPlayers.forEach((players, season) => {
                        nodes.push({
                            id: `Season ${season}`,
                            name: `Season ${season}`,
                            seasons: [season],
                            isSeasonNode: true,
                            players: players,
                            season: season,
                            logo_url: survivorData.season_logos[season]
                        });
                    });
                } else {
                    Object.entries(survivorData.players).forEach(([name, data]) => {
                        if (data.seasons.length === 1) {
                            nodes.push({
                                id: name,
                                name: name,
                                seasons: data.seasons,
                                image_url: data.image_url
                            });
                        }
                    });
                }

                // Create links
                const links = [];
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const nodeA = nodes[i];
                        const nodeB = nodes[j];
                        
                        // Skip if both are season nodes
                        if (nodeA.isSeasonNode && nodeB.isSeasonNode) continue;

                        let sharedSeasons;
                        if (nodeA.isSeasonNode) {
                            // Season node to player node
                            if (nodeB.seasons.includes(nodeA.seasons[0])) {
                                sharedSeasons = [nodeA.seasons[0]];
                            }
                        } else if (nodeB.isSeasonNode) {
                            // Player node to season node
                            if (nodeA.seasons.includes(nodeB.seasons[0])) {
                                sharedSeasons = [nodeB.seasons[0]];
                            }
                        } else {
                            // Player to player
                            sharedSeasons = nodeA.seasons.filter(season => 
                                nodeB.seasons.includes(season)
                            );
                        }

                        if (sharedSeasons && sharedSeasons.length > 0) {
                            links.push({
                                source: nodeA.id,
                                target: nodeB.id,
                                value: sharedSeasons.length,
                                seasons: sharedSeasons
                            });
                        }
                    }
                }

                setGraphData({ nodes, links });
            }
        };

        processData();
    }, [isCondensed, viewMode]);

    // Handle search
    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            return;
        }

        const term = searchTerm.toLowerCase();
        const results = Object.keys(survivorData.players)
            .filter(name => name.toLowerCase().includes(term))
            .slice(0, 5); // Limit to 5 results
        setSearchResults(results);
    }, [searchTerm]);

    // Highlight selected player
    const highlightPlayer = (playerId) => {
        if (!playerId) {
            setSelectedPlayer(null);
            return;
        }

        const playerData = survivorData.players[playerId];
        if (isCondensed && playerData && playerData.seasons.length === 1) {
            // For single-season players in condensed view, highlight their season node
            const seasonNodeId = `Season ${playerData.seasons[0]}`;
            setSelectedPlayer(seasonNodeId);
            if (graphRef.current) {
                const node = graphData.nodes.find(n => n.id === seasonNodeId);
                if (node) {
                    graphRef.current.centerAt(node.x, node.y, 1000);
                    graphRef.current.zoom(2, 1000);
                }
            }
        } else {
            // Normal behavior for multi-season players or non-condensed view
            setSelectedPlayer(playerId);
            if (graphRef.current) {
                const node = graphData.nodes.find(n => n.id === playerId);
                if (node) {
                    graphRef.current.centerAt(node.x, node.y, 1000);
                    graphRef.current.zoom(2, 1000);
                }
            }
        }
    };

    // Add helper function to get the display node ID for a player
    const getDisplayNodeId = (playerId) => {
        const playerData = survivorData.players[playerId];
        if (isCondensed && playerData && playerData.seasons.length === 1) {
            return `Season ${playerData.seasons[0]}`;
        }
        return playerId;
    };

    // Modified function to find all shortest paths
    const findAllShortestPaths = (start, end) => {
        if (!start || !end || start === end) {
            setShortestPaths(null);
            return;
        }

        // Convert start and end to their display nodes if needed
        const displayStart = getDisplayNodeId(start);
        const displayEnd = getDisplayNodeId(end);

        if (displayStart === displayEnd) {
            setShortestPaths([[displayStart]]);
            return;
        }

        // Convert graph to adjacency list for easier traversal
        const adjacencyList = new Map();
        graphData.nodes.forEach(node => {
            adjacencyList.set(node.id, []);
        });
        graphData.links.forEach(link => {
            adjacencyList.get(link.source.id).push(link.target.id);
            adjacencyList.get(link.target.id).push(link.source.id);
        });

        // BFS to find shortest distance first
        const distances = new Map();
        const queue = [displayStart];
        distances.set(displayStart, 0);
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (current === displayEnd) break;
            
            adjacencyList.get(current)?.forEach(neighbor => {
                if (!distances.has(neighbor)) {
                    distances.set(neighbor, distances.get(current) + 1);
                    queue.push(neighbor);
                }
            });
        }

        if (!distances.has(displayEnd)) {
            setShortestPaths(null);
            return;
        }

        // DFS to find all paths of shortest length
        const shortestDistance = distances.get(displayEnd);
        const allPaths = [];

        const dfs = (current, path, distance) => {
            if (distance > shortestDistance) return;
            if (current === displayEnd) {
                if (distance === shortestDistance) {
                    allPaths.push([...path]);
                }
                return;
            }

            adjacencyList.get(current)?.forEach(neighbor => {
                if (distances.get(neighbor) === distance + 1) {
                    path.push(neighbor);
                    dfs(neighbor, path, distance + 1);
                    path.pop();
                }
            });
        };

        dfs(displayStart, [displayStart], 0);
        setShortestPaths(allPaths);
    };

    // Add new effect for path search
    useEffect(() => {
        if (!pathSearchTerm.trim()) {
            setPathSearchResults([]);
            return;
        }

        const term = pathSearchTerm.toLowerCase();
        const results = Object.keys(survivorData.players)
            .filter(name => name.toLowerCase().includes(term))
            .slice(0, 5);
        setPathSearchResults(results);
    }, [pathSearchTerm]);

    useEffect(() => {
        const updatePositions = () => {
            if (searchInputRef.current) {
                const rect = searchInputRef.current.getBoundingClientRect();
                setSearchDropdownPosition({ 
                    top: rect.bottom - 8, 
                    left: rect.left - 8
                });
            }
            if (pathSearchInputRef.current) {
                const rect = pathSearchInputRef.current.getBoundingClientRect();
                setPathDropdownPosition({ 
                    top: rect.bottom - 8, 
                    left: rect.left - 8
                });
            }
        };

        updatePositions();
        window.addEventListener('scroll', updatePositions);
        window.addEventListener('resize', updatePositions);

        return () => {
            window.removeEventListener('scroll', updatePositions);
            window.removeEventListener('resize', updatePositions);
        };
    }, []);

    return (
        <div style={{ 
            width: '100vw', 
            height: '100vh',
            overflow: 'hidden',
            position: 'fixed',
            top: 0,
            left: 0
        }}>
            {isLoading && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    color: 'white',
                    fontSize: '20px'
                }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        border: '4px solid #f3f3f3',
                        borderTop: '4px solid #2196F3',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginBottom: '20px'
                    }} />
                    <style>
                        {`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        `}
                    </style>
                    <div>Loading Survivor Network...</div>
                </div>
            )}
            <div style={{ 
                position: 'fixed',
                top: '10px',
                zIndex: 999
            }}>
                <div style={{
                    display: 'flex',
                }}>
                    {!isMenuCollapsed && (
                        <div style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            padding: '12px',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            width: '280px',
                            maxWidth: '85vw',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            maxHeight: 'calc(98vh - 20px)',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            WebkitOverflowScrolling: 'touch'
                        }}>
                            <button 
                                onClick={() => setViewMode(viewMode === 'player' ? 'season' : 'player')}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#2196F3',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    width: '100%'
                                }}
                            >
                                {viewMode === 'player' ? 'Switch to Season View' : 'Switch to Player View'}
                            </button>

                            {viewMode === 'player' && (
                                <>
                                    <div 
                                        onClick={() => setIsCondensed(!isCondensed)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px',
                                            backgroundColor: '#333',
                                            borderRadius: '4px',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                        }}
                                    >
                                        <span>Condense Single-Season</span>
                                        <input
                                            type="checkbox"
                                            checked={isCondensed}
                                            onChange={() => setIsCondensed(!isCondensed)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                width: '16px',
                                                height: '16px',
                                                cursor: 'pointer'
                                            }}
                                        />
                                    </div>

                                    <div style={{ position: 'relative' }}>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onFocus={() => setIsSearchFocused(true)}
                                            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                                            placeholder="Search players..."
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                borderRadius: '4px',
                                                border: '1px solid #555',
                                                boxSizing: 'border-box',
                                                backgroundColor: '#444',
                                                color: '#fff'
                                            }}
                                        />
                                        {searchResults.length > 0 && isSearchFocused && (
                                            <div style={{
                                                position: 'fixed',
                                                top: searchDropdownPosition.top,
                                                left: searchDropdownPosition.left,
                                                width: searchInputRef.current?.offsetWidth,
                                                backgroundColor: '#333',
                                                border: '1px solid #555',
                                                borderRadius: '4px',
                                                marginTop: '2px',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                zIndex: 9999
                                            }}>
                                                {searchResults.map(name => (
                                                    <div
                                                        key={name}
                                                        onClick={() => {
                                                            highlightPlayer(name);
                                                            setSearchTerm('');
                                                            setSearchResults([]);
                                                        }}
                                                        style={{
                                                            padding: '8px',
                                                            cursor: 'pointer',
                                                            borderBottom: '1px solid #444',
                                                            color: '#fff',
                                                            backgroundColor: '#333',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}
                                                    >
                                                        {name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ 
                                        padding: '10px',
                                        backgroundColor: '#333',
                                        color: '#fff',
                                        borderRadius: '4px'
                                    }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>Find Path Between Players</div>
                                        {(!pathStartPlayer || !pathEndPlayer) && (
                                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                                <input
                                                    ref={pathSearchInputRef}
                                                    type="text"
                                                    value={pathSearchTerm}
                                                    onChange={(e) => setPathSearchTerm(e.target.value)}
                                                    onFocus={() => setIsPathSearchFocused(true)}
                                                    onBlur={() => setTimeout(() => setIsPathSearchFocused(false), 200)}
                                                    placeholder="Search paths..."
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #555',
                                                        boxSizing: 'border-box',
                                                        backgroundColor: '#444',
                                                        color: '#fff'
                                                    }}
                                                />
                                                {pathSearchResults.length > 0 && isPathSearchFocused && (
                                                    <div style={{
                                                        position: 'fixed',
                                                        top: pathDropdownPosition.top,
                                                        left: pathDropdownPosition.left,
                                                        width: pathSearchInputRef.current?.offsetWidth,
                                                        backgroundColor: '#333',
                                                        border: '1px solid #555',
                                                        borderRadius: '4px',
                                                        marginTop: '2px',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                        zIndex: 9999
                                                    }}>
                                                        {pathSearchResults.map(name => (
                                                            <div
                                                                key={name}
                                                                onClick={() => {
                                                                    if (!pathStartPlayer) {
                                                                        setPathStartPlayer(name);
                                                                    } else if (!pathEndPlayer) {
                                                                        setPathEndPlayer(name);
                                                                        findAllShortestPaths(pathStartPlayer, name);
                                                                    }
                                                                    setPathSearchTerm('');
                                                                    setPathSearchResults([]);
                                                                }}
                                                                style={{
                                                                    padding: '8px',
                                                                    cursor: 'pointer',
                                                                    borderBottom: '1px solid #444',
                                                                    color: '#fff',
                                                                    backgroundColor: '#333',
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis'
                                                                }}
                                                            >
                                                                {name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {pathStartPlayer && (
                                            <div style={{ 
                                                marginBottom: '8px',
                                                padding: '8px',
                                                fontSize: '14px',
                                                color: '#fff',
                                                backgroundColor: '#444',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>Start: {pathStartPlayer}</span>
                                                <button
                                                    onClick={() => {
                                                        setPathStartPlayer(null);
                                                        setPathEndPlayer(null);
                                                        setShortestPaths(null);
                                                    }}
                                                    style={{
                                                        padding: '2px 6px',
                                                        backgroundColor: '#ff4444',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}
                                        {pathEndPlayer && (
                                            <div style={{ 
                                                marginBottom: '8px',
                                                padding: '8px',
                                                fontSize: '14px',
                                                color: '#fff',
                                                backgroundColor: '#444',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>End: {pathEndPlayer}</span>
                                                <button
                                                    onClick={() => {
                                                        setPathEndPlayer(null);
                                                        setShortestPaths(null);
                                                    }}
                                                    style={{
                                                        padding: '2px 6px',
                                                        backgroundColor: '#ff4444',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}
                                        {shortestPaths && shortestPaths.length > 0 && (
                                            <div style={{
                                                marginTop: '8px',
                                                padding: '8px',
                                                backgroundColor: '#333',
                                                color: '#fff',
                                                borderRadius: '4px',
                                                fontSize: '14px'
                                            }}>
                                                <div>Found {shortestPaths.length} path{shortestPaths.length > 1 ? 's' : ''}</div>
                                                <div>Length: {shortestPaths[0].length - 1} connections</div>
                                                {shortestPaths.map((path, index) => (
                                                    <div key={index} style={{
                                                        marginTop: '4px',
                                                        padding: '4px',
                                                        backgroundColor: '#444',
                                                        borderRadius: '2px'
                                                    }}>
                                                        {path.map((nodeId, i) => {
                                                            // Get the display name
                                                            let displayName = nodeId;
                                                            if (nodeId.startsWith('Season ') && 
                                                                (nodeId === getDisplayNodeId(pathStartPlayer) || nodeId === getDisplayNodeId(pathEndPlayer))) {
                                                                displayName = nodeId === getDisplayNodeId(pathStartPlayer) ? pathStartPlayer : pathEndPlayer;
                                                            }

                                                            // If this is not the last node, find shared seasons with next node
                                                            if (i < path.length - 1) {
                                                                const nextNodeId = path[i + 1];
                                                                const currentPlayer = displayName.startsWith('Season ') ? null : displayName;
                                                                const nextPlayer = nextNodeId.startsWith('Season ') ? null : nextNodeId;
                                                                
                                                                let sharedSeasons = [];
                                                                if (currentPlayer && nextPlayer) {
                                                                    // Both are players
                                                                    const currentSeasons = survivorData.players[currentPlayer].seasons;
                                                                    const nextSeasons = survivorData.players[nextPlayer].seasons;
                                                                    sharedSeasons = currentSeasons.filter(s => nextSeasons.includes(s));
                                                                } else if (currentPlayer) {
                                                                    // Current is player, next is season
                                                                    const season = parseInt(nextNodeId.split(' ')[1]);
                                                                    if (survivorData.players[currentPlayer].seasons.includes(season)) {
                                                                        sharedSeasons = [season];
                                                                    }
                                                                } else if (nextPlayer) {
                                                                    // Current is season, next is player
                                                                    const season = parseInt(displayName.split(' ')[1]);
                                                                    if (survivorData.players[nextPlayer].seasons.includes(season)) {
                                                                        sharedSeasons = [season];
                                                                    }
                                                                }

                                                                return (
                                                                    <span key={i}>
                                                                        {displayName}
                                                                        <span style={{ color: '#888' }}> (S{sharedSeasons.join(', S')}) → </span>
                                                                    </span>
                                                                );
                                                            }
                                                            
                                                            // Last node
                                                            return <span key={i}>{displayName}</span>;
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <button
                        onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
                        style={{
                            padding: '8px',
                            backgroundColor: 'white',
                            color: '#333',
                            border: 'none',
                            borderRadius: '0 8px 8px 0',
                            cursor: 'pointer',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px',
                            boxShadow: '2px 0 8px rgba(0,0,0,0.2)',
                            touchAction: 'manipulation',
                            marginLeft: '-1px'
                        }}
                    >
                        {isMenuCollapsed ? '›' : '‹'}
                    </button>
                </div>
            </div>

            <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                nodeLabel={null}
                width={window.innerWidth}
                height={window.innerHeight}
                onEngineStop={engine => {
                    simulationRef.current = engine;
                }}
                onNodeDrag={(node, translate) => {
                    if (node && simulationRef.current) {
                        // Pause simulation during drag
                        simulationRef.current.alphaTarget(0);
                        
                        console.log('Drag:', {
                            node: node.id,
                            translate,
                            beforeFx: node.fx,
                            beforeFy: node.fy,
                            x: node.x,
                            y: node.y
                        });
                        
                        // Set both fixed and current positions
                        node.x = node.fx = translate.x;
                        node.y = node.fy = translate.y;
                        
                        console.log('After setting:', {
                            afterFx: node.fx,
                            afterFy: node.fy,
                            afterX: node.x,
                            afterY: node.y
                        });
                    }
                }}
                onNodeDragEnd={node => {
                    if (node && simulationRef.current) {
                        console.log('DragEnd:', {
                            node: node.id,
                            finalX: node.x,
                            finalY: node.y,
                            fx: node.fx,
                            fy: node.fy
                        });
                        
                        // Release node and restart simulation
                        node.fx = node.fy = null;
                        simulationRef.current.alphaTarget(0.1).restart();
                    }
                }}
                linkLabel={link => {
                    if (viewMode === 'season') {
                        return `${link.players.length} shared players: ${link.players.join(', ')}`;
                    }
                    return `Shared seasons: ${link.seasons.join(', ')}`;
                }}
                onNodeHover={(node, prevNode) => {
                    if (node !== hoveredNode) {
                        setHoveredNode(node);
                        if (node) {
                            setTooltipPos({ x: mousePos.x, y: mousePos.y });
                        }
                    }
                }}
                cooldownTicks={50}
                onNodeClick={node => {
                    setSelectedPlayer(node.id);
                    if (graphRef.current) {
                        graphRef.current.centerAt(node.x, node.y, 1000);
                    }
                }}
                onNodeRightClick={node => {
                    setHoveredNode(null);
                    setSelectedPlayer(null);
                }}
                onBackgroundClick={() => {
                    setHoveredNode(null);
                    setSelectedPlayer(null);
                }}
                onBackgroundRightClick={() => {
                    setHoveredNode(null);
                    setSelectedPlayer(null);
                }}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const size = getNodeSize(node);
                    const isHighlighted = selectedPlayer === node.id;
                    const isInPath = shortestPaths?.some(path => path.includes(node.id));
                    
                    // Draw highlight circle if selected or in path
                    if (isHighlighted || isInPath) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, size + HIGHLIGHT_GLOW_SIZE, 0, 2 * Math.PI);
                        ctx.fillStyle = isHighlighted ? '#00ff00' : '#ff9800';
                        ctx.fill();
                    }
                    
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
                    
                    if (node.isSeasonNode) {
                        ctx.fillStyle = viewMode === 'season' ? 
                            `hsl(${(node.season * 30) % 360}, 70%, 50%)` : // Different color for each season in season view
                            '#4CAF50'; // Original green in player view
                        ctx.fill();
                        
                        // Add black border for season nodes
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        
                        // Draw season logo instead of text
                        const seasonNum = node.season;
                        const logoImg = seasonLogoImages.get(seasonNum);
                        if (logoImg) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
                            ctx.clip();
                            const logoSize = size * 2;  // Adjust logo size to match node size
                            ctx.drawImage(logoImg, node.x - logoSize/2, node.y - logoSize/2, logoSize, logoSize);
                            ctx.restore();
                            
                            // Redraw the border after the logo
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
                            ctx.strokeStyle = '#000000';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    } else {
                        // Draw colored circle background
                        const numSeasons = node.seasons.length;
                        if (numSeasons >= 4) ctx.fillStyle = '#ff0000';
                        else if (numSeasons === 3) ctx.fillStyle = '#ff7f00';
                        else if (numSeasons === 2) ctx.fillStyle = '#ffff00';
                        else ctx.fillStyle = '#00ff00';
                        ctx.fill();
                        
                        // Draw player image if available
                        const img = nodeImages.get(node.name);
                        if (img) {
                            ctx.save();
                            ctx.clip();
                            
                            // Calculate source dimensions for center crop
                            const sourceSize = 80;
                            const sourceX = (128 - sourceSize) / 2;
                            const sourceY = 0;
                            
                            ctx.drawImage(
                                img,
                                sourceX, sourceY, sourceSize, sourceSize,
                                node.x - size, node.y - size, size * 2, size * 2
                            );
                            ctx.restore();
                        }
                    }
                    
                    ctx.strokeStyle = isHighlighted ? '#00ff00' : (isInPath ? '#ff9800' : '#fff');
                    ctx.lineWidth = (isHighlighted || isInPath) ? HIGHLIGHT_BORDER_WIDTH : BORDER_WIDTH;
                    ctx.stroke();
                }}
                linkWidth={link => {
                    if (!shortestPaths) return 0.5;
                    // Check if this link is part of any shortest path
                    for (const path of shortestPaths) {
                        for (let i = 0; i < path.length - 1; i++) {
                            if ((link.source.id === path[i] && link.target.id === path[i + 1]) ||
                                (link.source.id === path[i + 1] && link.target.id === path[i])) {
                                return 2;
                            }
                        }
                    }
                    return 0.5;
                }}
                linkColor={link => {
                    if (!shortestPaths) {
                        const isHighlighted = selectedPlayer && 
                            (link.source.id === selectedPlayer || link.target.id === selectedPlayer);
                        return isHighlighted ? '#00ff00' : '#999';
                    }
                    // Check if this link is part of any shortest path
                    for (const path of shortestPaths) {
                        for (let i = 0; i < path.length - 1; i++) {
                            if ((link.source.id === path[i] && link.target.id === path[i + 1]) ||
                                (link.source.id === path[i + 1] && link.target.id === path[i])) {
                                return '#ff9800';
                            }
                        }
                    }
                    return '#999';
                }}
                d3Force={(d3Force) => {
                    // Link force - keeps connected nodes at specified distance
                    d3Force('link')
                        .distance(link => MIN_LINK_DISTANCE * (1 + link.value))
                        .strength(0.3);

                    // Charge force - makes nodes repel each other
                    d3Force('charge')
                        .strength(node => node.isSeasonNode ? CHARGE_STRENGTH * 1.5 : CHARGE_STRENGTH)
                        .distanceMax(MIN_LINK_DISTANCE * 10);

                    // Center force - pulls the graph to the center of the viewport
                    d3Force('center')
                        .strength(0.1);

                    // Collision force - prevents node overlap
                    d3Force('collision', d3Force.forceCollide()
                        .radius(COLLISION_DISTANCE)
                        .strength(0.5)
                        .iterations(2));

                    // Radial force
                    if (!d3Force('radial')) {
                        d3Force.force('radial', d3Force.forceRadial()
                            .radius(MIN_LINK_DISTANCE * 5)
                            .strength(0.1)
                            .x(window.innerWidth / 2)
                            .y(window.innerHeight / 2));
                    }
                }}
                zoom={4}
                minZoom={0.5}
                maxZoom={10}
            />
            {hoveredNode && (
                <div style={{
                    position: 'fixed',
                    left: `${Math.min(mousePos.x + 10, window.innerWidth - 210)}px`,
                    top: `${Math.min(mousePos.y - 10, window.innerHeight - 100)}px`,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    pointerEvents: 'none',
                    zIndex: 999,
                    maxWidth: '200px',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}>
                    <div style={{ fontWeight: 'bold' }}>{hoveredNode.name}</div>
                    {!hoveredNode.isSeasonNode && (
                        <div>Seasons: {hoveredNode.seasons.join(', ')}</div>
                    )}
                    {hoveredNode.isSeasonNode && viewMode === 'player' && (
                        <div>{hoveredNode.players.length} players</div>
                    )}
                    {hoveredNode.isSeasonNode && viewMode === 'season' && (
                        <div>{hoveredNode.playerCount} total players</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SurvivorGraph; 