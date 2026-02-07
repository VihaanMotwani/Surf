from PIL import Image, ImageDraw, ImageOps
import sys
import os

source_path = "/Users/vihaan/.gemini/antigravity/brain/ca51224e-2362-4e5a-8dc4-5e40a047b082/media__1770486707726.png"
dest_path = "/Users/vihaan/Developer/active/Surf/resources/icon.png"

# Ensure resources dir exists
os.makedirs(os.path.dirname(dest_path), exist_ok=True)

try:
    img = Image.open(source_path).convert("RGBA")
    
    # Resize to 1024x1024
    size = (1024, 1024)
    img = img.resize(size, Image.Resampling.LANCZOS)
    
    # Create mask for rounded corners (squircle-ish)
    # macOS icon shape is complex, but a rounded rect with radius ~180-220 is close enough for simple usage
    # or use a superellipse. Here we use a rounded rectangle
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    # Radius ~ 18% of 1024 is ~184. Apple uses ~22% for new icons (225px)
    radius = 225 
    draw.rounded_rectangle([(0, 0), size], radius=radius, fill=255)
    
    # Apply mask
    output = ImageOps.fit(img, mask.size, centering=(0.5, 0.5))
    output.putalpha(mask)
    
    output.save(dest_path, "PNG")
    print(f"Icon updated: {dest_path}")
    
except Exception as e:
    print(f"Error processing image: {e}")
    sys.exit(1)
