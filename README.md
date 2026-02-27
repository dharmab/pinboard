# Pinboard

Pinboard is a visual relationship board that runs in your web browser. Place cards on a freeform canvas, group related cards into labeled containers, and draw labeled lines between them to map out relationships. Organize your work across multiple tabs within a board, and switch between boards as needed.

Everything runs locally on your computer — no accounts, no cloud sync, no data leaving your machine. You can export your boards as ZIP files for backup, or as PNG and PDF images.

## First-Time Setup

These instructions are written for a Mac. You only need to do this once.

### 1. Open Terminal

Open Finder, go to Applications > Utilities, and double-click **Terminal**. A window with a text prompt will appear. You'll paste commands into this window throughout the setup process.

### 2. Install Homebrew

Homebrew is a tool that makes it easy to install other software on a Mac. Paste the following into Terminal and press Return:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your Mac password (the one you use to log in). As you type the password, nothing will appear on screen — that's normal. Press Return when you're done typing it.

When the install finishes, it will print a **Next steps** section with two commands to run. Paste and run each of those commands. If you skip this step, the `brew` command won't work.

### 3. Install Git and Bun

Git is a tool for downloading software projects. Bun is a tool for running JavaScript applications like Pinboard. Paste the following into Terminal and press Return:

```sh
brew install git bun
```

### 4. Download Pinboard

Paste the following into Terminal and press Return:

```sh
git clone https://github.com/dharmab/pinboard.git
```

Then move into the Pinboard folder:

```sh
cd pinboard
```

### 5. Install Pinboard

Paste the following into Terminal and press Return. This downloads the additional software that Pinboard needs to run:

```sh
bun install
```

## Running Pinboard

Every time you want to use Pinboard, open Terminal and run:

```sh
cd pinboard && bun run dev
```

After a moment, open your web browser and go to `http://localhost:3000`. Pinboard will appear in the browser window.

When you're done, go back to Terminal and press Control-C to stop it.

## Batch Editing with the ZIP Export

If you need to add, edit, or remove a large number of cards at once, it's much faster to work with the exported ZIP file in a spreadsheet than to make changes one by one in the app.

### Exporting

In Pinboard, click the export button in the toolbar and choose **ZIP**. A file like `My Board_2026-02-26.zip` will download to your Downloads folder.

### Opening the ZIP

Double-click the ZIP file in Finder to unzip it. Inside you'll find a folder containing several CSV files and an `images` folder:

- **cards.csv** — Every card in the board. Columns: `id`, `title`, `description`, `image_filename`.
- **tabs.csv** — The tabs in the board. Columns: `id`, `name`, `order` (starting from 0).
- **placements.csv** — Where each card is positioned on each tab. Columns: `id`, `tab_id`, `card_id`, `x`, `y`, `group_id`.
- **groups.csv** — The groups on each tab. Columns: `id`, `tab_id`, `label`, `x`, `y`, `width`, `height`.
- **connections.csv** — The lines drawn between cards and groups. Columns: `tab_id`, `from_type`, `from_id`, `to_type`, `to_id`, `label`, `color`.

### Editing in Excel or Numbers

Right-click a CSV file, choose Open With, and select **Microsoft Excel** or **Numbers**. You can edit values, add new rows, or delete rows just like any spreadsheet.

A few things to keep in mind:

- **IDs are references.** Each card, tab, placement, and group has an `id` value. Other files refer to these IDs to link things together. For example, a row in `placements.csv` uses `card_id` to say which card it places and `tab_id` to say which tab it goes on. If you add new rows, make up a short unique ID for each one (like `card-100` or `tab-3`) — Pinboard will assign its own internal IDs when you import.
- **To add a new card,** add a row to `cards.csv` with a new ID and a title. Then add a row to `placements.csv` to place it on a tab, giving it an `x` and `y` position.
- **To rename cards in bulk,** edit the `title` column in `cards.csv`.
- **To delete a card,** remove its row from `cards.csv` and also remove any rows in `placements.csv` and `connections.csv` that reference it. Pinboard will reject the import if a placement points to a card that doesn't exist.
- **Connection colors** must be one of: `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `gray`.
- **Connection types** (`from_type`, `to_type`) must be either `card` or `group`. When the type is `card`, the corresponding ID (`from_id` or `to_id`) is a placement ID from `placements.csv`. When the type is `group`, it's a group ID from `groups.csv`.

### Saving and re-importing

When you're done editing, save the CSV files. If you're using Excel, make sure to save as **CSV UTF-8** (not as an Excel workbook).

Select all the CSV files and the `images` folder in Finder, right-click, and choose **Compress**. This creates a new ZIP file.

In Pinboard, click the import button in the toolbar and select your new ZIP file. Pinboard will create a new board from the contents. If anything is wrong with the data (a missing column, a broken reference between files), it will show an error message explaining what needs to be fixed.
