import React from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';

const EmojiPickerComponent = ({ onEmojiClick }) => {
  return (
    <div className="emoji-picker-wrapper glass" style={{ border: 'none', overflow: 'hidden' }}>
      <EmojiPicker 
        onEmojiClick={onEmojiClick}
        theme={Theme.DARK}
        lazyLoadEmojis={true}
        searchPlaceholder="Search emoji..."
        width={350}
        height={400}
      />
    </div>
  );
};

export default EmojiPickerComponent;
