import os
import requests
import time

# Create logos directory if it doesn't exist
os.makedirs("survivor-graph/public/logos", exist_ok=True)

# Headers to mimic a browser request
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

# Final seasons from logos.html
logos = {
    44: "https://static.wikia.nocookie.net/survivor/images/2/2e/Survivor_44_logo.png",
    45: "https://static.wikia.nocookie.net/survivor/images/4/4f/Survivor_45_logo.png",
    46: "https://static.wikia.nocookie.net/survivor/images/0/04/Survivor_46_Logo.png",
    47: "https://static.wikia.nocookie.net/survivor/images/a/a7/Survivor_47_Logo.png",
    48: "https://static.wikia.nocookie.net/survivor/images/1/15/Survivor_48_Logo.PNG"
}

# Download each logo
for season, url in logos.items():
    # Create filename based on season number
    filename = f"survivor-graph/public/logos/season_{season}.png"
    
    # Skip if file already exists
    if os.path.exists(filename):
        print(f"Season {season} logo already exists, skipping...")
        continue
    
    # Download the image
    print(f"Downloading season {season} logo...")
    url_with_params = f"{url}/revision/latest/smart/width/128/height/80"
    response = requests.get(url_with_params, headers=headers)
    if response.status_code == 200:
        with open(filename, 'wb') as f:
            f.write(response.content)
        print(f"Saved season {season} logo to {filename}")
    else:
        print(f"Failed to download season {season} logo: {response.status_code}")
    
    # Be nice to the server
    time.sleep(1)

print("Done downloading logos!") 