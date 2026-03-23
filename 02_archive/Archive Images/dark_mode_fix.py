from PIL import Image
import numpy as np

def seamless_integration(input_file, output_file, bg_color=(2, 6, 23)):
    """
    Reads the target acquisition image, detects the white background,
    and replaces it with the site's Navy-950 color for seamless integration.
    """
    print(f"Processing {input_file}...")
    
    try:
        img = Image.open(input_file).convert("RGBA")
        data = np.array(img)

        # Define what we consider "White" (The background)
        # We look for pixels brighter than 230 in all channels
        r, g, b, a = data.T
        white_areas = (r > 230) & (g > 230) & (b > 230)

        # Replace white areas with Navy-950 (#020617 -> RGB: 2, 6, 23)
        data[..., :-1][white_areas.T] = bg_color 

        # Create new image
        new_img = Image.fromarray(data)
        
        # Convert back to RGB and save (JPG doesn't support transparency, so we use the BG color)
        new_img = new_img.convert("RGB")
        new_img.save(output_file, quality=95)
        print(f"SUCCESS: Image saved as {output_file}. It will now match your website background.")

    except Exception as e:
        print(f"ERROR: Could not process image. {e}")

# Run the function
# Ensure your original file is named 'original_phones.jpg' or update this line
seamless_integration("targeting-sequence.jpg", "targeting-sequence-dark.jpg")