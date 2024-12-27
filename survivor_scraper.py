import requests
from bs4 import BeautifulSoup
import json
from typing import Dict, List, Set
import time
import os

class SurvivorScraper:
    def __init__(self):
        self.base_url = "https://www.truedorktimes.com/survivor/cast/season{}-{}.htm"
        self.players: Dict[str, Dict[str, any]] = {}  # player_name -> {seasons: [], image_url: str}
        self.season_logos: Dict[int, str] = {}  # season_number -> logo_url
        
        # Initialize season logos with local file paths
        self.season_logos = {
            season: f"/logos/season_{season}.png"
            for season in range(1, 49)
        }
        
    def process_saved_files(self):
        """Process all saved HTML files to build the complete dataset"""
        ranges = [(1,10), (11,20), (21,30), (31,40), (41,50)]
        
        for start, end in ranges:
            filename = f"survivor_seasons_{start}-{end}.html"
            try:
                with open(filename, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.parse_page(content, start, end)
            except FileNotFoundError:
                print(f"Warning: {filename} not found")

    def run(self):
        # First save the HTML files if they don't exist
        files_exist = all(os.path.exists(f"survivor_seasons_{start}-{end}.html") 
                         for start, end in [(1,10), (11,20), (21,30), (31,40), (41,50)])
        
        if not files_exist:
            self.save_html_for_analysis()
        
        # Then process all files to build the complete dataset
        self.process_saved_files()
        
        # Finally save the data
        self.save_data()

    def save_html_for_analysis(self):
        """Save HTML content locally for analysis"""
        ranges = [(1,10), (11,20), (21,30), (31,40), (41,50)]
        
        for start, end in ranges:
            url = self.base_url.format(start, end)
            try:
                page_content = self.fetch_page(url)
                filename = f"survivor_seasons_{start}-{end}.html"
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(page_content)
                print(f"Saved {filename}")
            except requests.RequestException as e:
                print(f"Error fetching seasons {start}-{end}: {e}")
            time.sleep(2)

    def fetch_page(self, url: str) -> str:
        # Add delay to be nice to the server
        time.sleep(1)
        response = requests.get(url)
        response.raise_for_status()
        return response.text

    def clean_name(self, name: str) -> str:
        # Remove quotes and normalize spaces
        name = name.strip()
        
        # Remove numerical prefixes (e.g., "1. ", "2. ")
        parts = name.split()
        parts = [p for p in parts if not p.rstrip('.').isdigit()]
        
        # Handle special cases and capitalization
        cleaned = []
        for part in parts:
            # Skip empty parts
            if not part:
                continue
                
            # Remove quotes if present (for nicknames)
            if part.startswith("'") and part.endswith("'"):
                part = part[1:-1]
            
            # Handle all-caps names
            if part.isupper() and len(part) > 2:
                part = part.capitalize()
            
            cleaned.append(part)
        
        full_name = ' '.join(cleaned)
        
        # Handle special cases where players are known by multiple names
        name_mappings = {
            "Rob Mariano": "Boston Rob Mariano",
            "Boston Rob": "Boston Rob Mariano",
            "Candice Woodcock": "Candice Woodcock Cody",
            "Candice Cody": "Candice Woodcock Cody",
            "Amber Brkich": "Amber Mariano",
        }
        
        return name_mappings.get(full_name, full_name)

    def parse_page(self, content: str, start_season: int, end_season: int):
        soup = BeautifulSoup(content, 'html.parser')
        
        # Find all season cards
        season_cards = soup.find_all('div', class_='card')
        
        for card in season_cards:
            # Get season number from the card divider
            divider = card.find('div', class_='card-divider')
            if not divider:
                continue
            
            # Look for season number in the image alt text first
            img = divider.find('img')
            season_num = None
            if img and img.get('alt'):
                alt_text = img.get('alt')
                if 'S' in alt_text:
                    try:
                        season_num = int(''.join(c for c in alt_text.split('S')[1] if c.isdigit()))
                        # We don't need to grab the logo URL anymore since we're using hardcoded values
                    except (IndexError, ValueError):
                        pass
            
            # If not found in image, try the divider text
            if not season_num:
                season_text = divider.get_text().strip()
                # Try different season number formats
                if 'S' in season_text:
                    try:
                        s_part = season_text.split('S')[1]
                        season_num = int(''.join(c for c in s_part if c.isdigit()))
                    except (IndexError, ValueError):
                        pass
                
                if not season_num and 'Survivor ' in season_text:
                    try:
                        season_num = int(season_text.split('Survivor ')[1].split()[0])
                    except (IndexError, ValueError):
                        pass
                
                if not season_num:
                    # Last resort: try to find any number in the text
                    try:
                        numbers = [int(s) for s in season_text.split() if s.strip(':').isdigit()]
                        if numbers:
                            season_num = numbers[0]
                    except (ValueError):
                        pass
            
            if not season_num or season_num < start_season or season_num > end_season:
                continue
            
            # Find all contestant entries in this season card
            contestant_entries = card.find_all('li', class_=['final', 'jury', 'generic'])
            
            for entry in contestant_entries:
                link = entry.find('a')
                if not link:
                    continue
                
                # Get contestant image URL
                img = link.find('img')
                image_url = None
                if img and img.get('src'):
                    image_url = 'https://www.truedorktimes.com/survivor/cast/' + img.get('src')
                
                # Get contestant name from the spans
                name_spans = link.find_all('span', class_=['firstname', 'lastname'])
                if not name_spans:
                    # Try getting name directly from link if no spans
                    name = link.get_text().strip()
                    if name:
                        full_name = self.clean_name(name)
                        if full_name:
                            if full_name not in self.players:
                                self.players[full_name] = {
                                    "seasons": set(),
                                    "image_url": image_url
                                }
                            self.players[full_name]["seasons"].add(season_num)
                    continue
                
                # Process each name part and combine
                name_parts = []
                for span in name_spans:
                    text = span.get_text().strip()
                    if text:
                        # Handle cases where nickname is part of firstname
                        if "'" in text and text.count("'") == 2:
                            nickname = text[text.find("'")+1:text.rfind("'")]
                            name_parts.append(nickname)
                        else:
                            name_parts.append(text)
                
                full_name = self.clean_name(' '.join(name_parts))
                if not full_name:
                    continue
                
                # Add or update player's seasons and image
                if full_name not in self.players:
                    self.players[full_name] = {
                        "seasons": set(),
                        "image_url": image_url
                    }
                self.players[full_name]["seasons"].add(season_num)
                if image_url:  # Update image URL if we found one
                    self.players[full_name]["image_url"] = image_url

    def save_data(self, filename: str = None):
        if filename is None:
            # Create data directory if it doesn't exist
            data_dir = "survivor-graph/src/data"
            os.makedirs(data_dir, exist_ok=True)
            filename = os.path.join(data_dir, "survivor_data.json")

        # Merge any duplicate entries that might exist
        merged_data = {}
        for player, data in self.players.items():
            if "Rob Mariano" in player:  # Special case for Boston Rob
                key = "Boston Rob Mariano"
            else:
                key = player
            
            if key not in merged_data:
                merged_data[key] = {
                    "seasons": set(),
                    "image_url": data["image_url"]
                }
            merged_data[key]["seasons"].update(data["seasons"])
        
        # Convert sets to lists for JSON serialization
        output_data = {
            "players": {
                name: {
                    "seasons": sorted(list(data["seasons"])),
                    "image_url": data["image_url"]
                }
                for name, data in merged_data.items()
            },
            "season_logos": self.season_logos
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2)

if __name__ == "__main__":
    scraper = SurvivorScraper()
    scraper.run() 