import { spawn, SpawnOptions } from 'child_process'
import { pathExists } from '../../ui/lib/path-exists'
import { ExternalEditorError, FoundEditor, ExternalEditor } from './shared'
import {
  expandTargetPathArgument,
  ICustomIntegration,
  parseCustomIntegrationArguments,
} from '../custom-integration'

/**
 * Generate the command line arguments for opening a file at a specific line
 * in different editors.
 */
function getArgumentsForEditor(
  editor: ExternalEditor,
  fullPath: string,
  lineNumber: number
): string[] {
  // Map of editors to their line number argument formats
  switch (editor) {
    // VS Code and variants use --goto
    case 'Visual Studio Code':
    case 'Visual Studio Code (Insiders)':
    case 'VSCodium':
    case 'Cursor':
    case 'Windsurf':
      return ['--goto', `${fullPath}:${lineNumber}`]

    // Atom and Pulsar use file:line format
    case 'Atom':
    case 'Pulsar':
      return [`${fullPath}:${lineNumber}`]

    // Sublime Text uses file:line format
    case 'Sublime Text':
      return [`${fullPath}:${lineNumber}`]

    // JetBrains IDEs use --line
    case 'IntelliJ':
    case 'IntelliJ Community Edition':
    case 'PhpStorm':
    case 'PyCharm':
    case 'PyCharm Community Edition':
    case 'DataSpell':
    case 'RubyMine':
    case 'RustRover':
    case 'WebStorm':
    case 'CLion':
    case 'GoLand':
    case 'Android Studio':
    case 'Rider':
    case 'Fleet':
      return ['--line', lineNumber.toString(), fullPath]

    // Vim and variants use +line
    case 'MacVim':
    case 'Neovide':
    case 'VimR':
      return [`+${lineNumber}`, fullPath]

    // TextMate uses -l
    case 'TextMate':
      return ['-l', lineNumber.toString(), fullPath]

    // BBEdit uses +line
    case 'BBEdit':
      return [`+${lineNumber}`, fullPath]

    // Nova uses file:line format
    case 'Nova':
      return [`${fullPath}:${lineNumber}`]

    // Emacs uses +line
    case 'Emacs':
      return [`+${lineNumber}`, fullPath]

    // Zed uses file:line format
    case 'Zed':
    case 'Zed (Preview)':
      return [`${fullPath}:${lineNumber}`]

    // For editors we don't know about, try the file:line format
    // as it's most common
    default:
      return [`${fullPath}:${lineNumber}`]
  }
}

async function launchEditor(
  editorPath: string,
  args: readonly string[],
  editorName: string,
  spawnAsDarwinApp: boolean
) {
  const exists = await pathExists(editorPath)
  const label = __DARWIN__ ? 'Settings' : 'Options'
  if (!exists) {
    throw new ExternalEditorError(
      `Could not find executable for ${editorName} at path '${editorPath}'. Please open ${label} and select an available editor.`,
      { openPreferences: true }
    )
  }

  return new Promise<void>((resolve, reject) => {
    const opts: SpawnOptions = {
      // Make sure the editor processes are detached from the Desktop app.
      // Otherwise, some editors (like Notepad++) will be killed when the
      // Desktop app is closed.
      detached: true,
      stdio: 'ignore',
    }

    const child = spawnAsDarwinApp
      ? spawn('open', ['-a', editorPath, ...args], opts)
      : spawn(editorPath, args, opts)

    child.on('error', reject)
    child.on('spawn', resolve)
    child.unref() // Don't wait for editor to exit
  }).catch((e: unknown) => {
    log.error(
      `Error while launching ${editorName}`,
      e instanceof Error ? e : undefined
    )
    throw new ExternalEditorError(
      e && typeof e === 'object' && 'code' in e && e.code === 'EACCES'
        ? `GitHub Desktop doesn't have the proper permissions to start ${editorName}. Please open ${label} and try another editor.`
        : `Something went wrong while trying to start ${editorName}. Please open ${label} and try another editor.`,
      { openPreferences: true }
    )
  })
}

/**
 * Open a given file or folder in the desired external editor.
 *
 * @param fullPath A folder or file path to pass as an argument when launching the editor.
 * @param editor The external editor to launch.
 * @param lineNumber Optional line number to jump to in the file.
 */
export const launchExternalEditor = (
  fullPath: string,
  editor: FoundEditor,
  lineNumber?: number
) => {
  const args = lineNumber
    ? getArgumentsForEditor(editor.editor, fullPath, lineNumber)
    : [fullPath]
  return launchEditor(editor.path, args, `'${editor.editor}'`, __DARWIN__)
}

/**
 * Open a given file or folder in the desired custom external editor.
 *
 * @param fullPath A folder or file path to pass as an argument when launching the editor.
 * @param customEditor The external editor to launch.
 */
export const launchCustomExternalEditor = (
  fullPath: string,
  customEditor: ICustomIntegration
) => {
  const argv = parseCustomIntegrationArguments(customEditor.arguments)

  // Replace instances of RepoPathArgument with fullPath in customEditor.arguments
  const args = expandTargetPathArgument(argv, fullPath)

  // In macOS we can use `open` if it's an app (i.e. if we have a bundleID),
  // which will open the right executable file for us, we only need the path
  // to the editor .app folder.
  const spawnAsDarwinApp = __DARWIN__ && customEditor.bundleID !== undefined
  const editorName = `custom editor at path '${customEditor.path}'`

  return launchEditor(customEditor.path, args, editorName, spawnAsDarwinApp)
}
