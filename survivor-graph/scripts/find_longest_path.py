import json
from collections import defaultdict, deque
import os

def load_survivor_data():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(script_dir, '..', 'src', 'data', 'survivor_data.json')
    with open(data_path, 'r') as f:
        return json.load(f)

def build_graph(survivor_data):
    # Create adjacency list for players who shared a season
    graph = defaultdict(set)
    
    # Group players by season
    seasons = defaultdict(set)
    for player, data in survivor_data['players'].items():
        for season in data['seasons']:
            seasons[season].add(player)
    
    # Connect players who shared a season
    for season_players in seasons.values():
        for player1 in season_players:
            for player2 in season_players:
                if player1 != player2:
                    graph[player1].add(player2)
    
    return graph

def find_shortest_path(graph, start, end):
    if start not in graph or end not in graph:
        return None
    
    queue = deque([(start, [start])])
    visited = {start}
    
    while queue:
        vertex, path = queue.popleft()
        if vertex == end:
            return path
            
        for neighbor in graph[vertex]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))
    
    return None

def find_longest_shortest_path(survivor_data):
    graph = build_graph(survivor_data)
    max_paths = []
    max_length = 0
    total_valid_paths = 0
    
    players = list(survivor_data['players'].keys())
    total_pairs = len(players) * (len(players) - 1) // 2
    processed = 0
    
    print("Finding longest shortest path...")
    print("Total pairs to check:", total_pairs)
    
    for i, player1 in enumerate(players):
        for player2 in players[i+1:]:
            path = find_shortest_path(graph, player1, player2)
            if path:
                total_valid_paths += 1
                if len(path) > max_length:
                    max_length = len(path)
                    max_paths = [(path, (player1, player2))]
                elif len(path) == max_length:
                    max_paths.append((path, (player1, player2)))
            
            processed += 1
            if processed % 1000 == 0:
                print(f"Processed {processed}/{total_pairs} pairs...")
    
    return max_paths, total_valid_paths

def main():
    survivor_data = load_survivor_data()
    longest_paths, total_valid_paths = find_longest_shortest_path(survivor_data)
    
    # Basic stats
    print("\nLongest Path Statistics:")
    print(f"Number of longest paths found: {len(longest_paths)}")
    print(f"Total number of valid paths: {total_valid_paths}")
    print(f"Percentage of paths that are longest: {(len(longest_paths) / total_valid_paths * 100):.2f}%")
    print(f"Length of longest paths: {len(longest_paths[0][0]) - 1} connections")
    
    # Count endpoint frequencies
    endpoint_counts = {}
    for path, (start, end) in longest_paths:
        endpoint_counts[start] = endpoint_counts.get(start, 0) + 1
        endpoint_counts[end] = endpoint_counts.get(end, 0) + 1
    
    # Sort endpoints by frequency
    sorted_endpoints = sorted(endpoint_counts.items(), key=lambda x: x[1], reverse=True)
    
    print("\nMost Common Players as Endpoints in Longest Paths:")
    for player, count in sorted_endpoints[:10]:  # Top 10
        seasons = survivor_data['players'][player]['seasons']
        print(f"{player} ({count} paths) - Seasons: {', '.join(map(str, seasons))}")
    
    # Count most common intermediate players
    intermediate_counts = {}
    for path, _ in longest_paths:
        for player in path[1:-1]:  # Exclude endpoints
            intermediate_counts[player] = intermediate_counts.get(player, 0) + 1
    
    sorted_intermediates = sorted(intermediate_counts.items(), key=lambda x: x[1], reverse=True)
    
    print("\nMost Common Intermediate Players in Longest Paths:")
    for player, count in sorted_intermediates[:5]:  # Top 5
        seasons = survivor_data['players'][player]['seasons']
        percentage = (count / len(longest_paths)) * 100
        print(f"{player} (appears in {count} paths, {percentage:.1f}%) - Seasons: {', '.join(map(str, seasons))}")

if __name__ == "__main__":
    main() 