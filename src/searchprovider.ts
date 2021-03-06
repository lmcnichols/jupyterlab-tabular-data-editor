// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
import { ISearchProvider, ISearchMatch } from '@jupyterlab/documentsearch';
import { DSVEditor } from './widget';
import { DocumentWidget } from '@jupyterlab/docregistry';
import { Signal, ISignal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';

// The type for which canSearchFor returns true
export type CSVDocumentWidget = DocumentWidget<DSVEditor>;

/**
 * Responsible for managing the state of the search-and-replace UI element in JupyterLab
 * Contains methods to query a search, highlight the previous/next match,
 * replace the current match, and replace all matches
 */
export class CSVSearchProvider implements ISearchProvider<CSVDocumentWidget> {
  /**
   * Report whether or not this provider has the ability to search on the given object
   */
  static canSearchOn(domain: Widget): domain is CSVDocumentWidget {
    // check to see if the CSVSearchProvider can search on the
    // first cell, false indicates another editor is present
    return (
      domain instanceof DocumentWidget && domain.content instanceof DSVEditor
    );
  }

  /**
   * Get an initial query value if applicable so that it can be entered
   * into the search box as an initial query
   *
   * @returns Initial value used to populate the search box.
   */
  getInitialQuery(searchTarget: CSVDocumentWidget): any {
    // CSV Viewer does not support selection
    return null;
  }

  /**
   * Initialize the search using the provided options.  Should update the UI
   * to highlight all matches and "select" whatever the first match should be.
   *
   * @param query A RegExp to be use to perform the search
   * @param searchTarget The widget to be searched
   *
   * @returns A promise that resolves with a list of all matches
   */
  async startQuery(
    query: RegExp,
    searchTarget: CSVDocumentWidget
  ): Promise<ISearchMatch[]> {
    this._target = searchTarget;
    this._query = query;

    // when changes are made to the datamodel, rerun the search
    searchTarget.content.dataModel.onChangedSignal.connect(
      this.rerunSearch,
      this
    );

    // query for the matches in the model data
    searchTarget.content.searchService.find(query);

    // update match variables in CSVSearchProvider
    this._matches = searchTarget.content.searchService.matches;
    this._currentMatch = searchTarget.content.searchService.currentMatch;
    this.moveToCell();
    return this._matches;
  }

  /**
   * Clears state of a search provider to prepare for startQuery to be called
   * in order to start a new query or refresh an existing one.
   *
   * @returns A promise that resolves when the search provider is ready to
   * begin a new search.
   */
  async endQuery(): Promise<void> {
    this._matches = [];
    this._currentMatch = null;
    this._target.content.dataModel.changed.disconnect(this.rerunSearch, this);
    this._target.content.searchService.clear();
  }

  /**
   * Resets UI state as it was before the search process began.  Cleans up and
   * disposes of all internal state.
   *
   * @returns A promise that resolves when all state has been cleaned up.
   */
  async endSearch(): Promise<void> {
    this._target.content.searchService.clear();
    this._target.content.dataModel.changed.disconnect(this.rerunSearch, this);
    this._query = undefined;
  }

  /**
   * Move the current match indicator to the next match.
   *
   * @returns A promise that resolves once the action has completed.
   */
  async highlightNext(): Promise<ISearchMatch | undefined> {
    this._currentMatch = this._target.content.searchService.highlightNext(
      false
    );
    this.moveToCell();
    return this._currentMatch;
  }

  /**
   * Move the current match indicator to the previous match.
   *
   * @returns A promise that resolves once the action has completed.
   */
  async highlightPrevious(): Promise<ISearchMatch | undefined> {
    this._currentMatch = this._target.content.searchService.highlightNext(true);
    this.moveToCell();
    return this._currentMatch;
  }

  /**
   * Replace the currently selected match with the provided text
   *
   * @returns A promise that resolves once the action has completed.
   */
  async replaceCurrentMatch(
    newText: string,
    update?: DSVEditor.ModelChangedArgs
  ): Promise<boolean> {
    const { line, column } = this._target.content.searchService.currentMatch;
    this._target.content.dataModel.setData(
      'body',
      line,
      column,
      newText,
      1,
      1,
      update
    );
    return true;
  }

  /**
   * Replace all matches in the notebook with the provided text
   * Not implemented in the CSV viewer as it is read-only.
   *
   * @returns A promise that resolves once the action has completed.
   */
  async replaceAllMatches(newText: string): Promise<boolean> {
    const model = this._target.content.dataModel;

    const rows: number[] = [];
    const columns: number[] = [];

    // replace every match individually
    let i = 0;
    while (i < this.matches.length) {
      const { line, column } = this.matches[i];
      rows.push(line);
      columns.push(column);
      i++;
    }
    this.moveToCell();
    const update = model.bulkSetData(rows, columns, newText);
    model.onChangedSignal.emit(update);
    return true;
  }

  /**
   * Reruns the search query when changes a made
   * Used when changes are made to the data model
   */
  rerunSearch(): boolean {
    this.endQuery();
    this.startQuery(this._query, this._target);
    this._changed.emit(undefined);
    this.moveToCell();
    return true;
  }

  /**
   * Moves and selects the cell that is the current match
   */
  protected moveToCell(): void {
    if (this._target && this._currentMatch) {
      const { line, column } = this._currentMatch;
      this._target.content.selectSingleCell(line, column);

      // calculate the offsets and then scroll to that cell
      const rowOffset = this._target.content.grid.rowOffset('body', line);
      const columnOffset = this._target.content.grid.columnOffset(
        'body',
        column
      );
      this._target.content.grid.scrollTo(columnOffset, rowOffset);
    }
  }

  /**
   * Signal indicating that something in the search has changed, so the UI should update
   */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  /**
   * The same list of matches provided by the startQuery promise resolution
   */
  get matches(): ISearchMatch[] {
    // Ensure that no other fn can overwrite matches index property
    // We shallow clone each node
    return this._matches
      ? this._matches.map(m => Object.assign({}, m))
      : this._matches;
  }

  /**
   * The current index of the selected match.
   */
  get currentMatchIndex(): number | null {
    if (!this._currentMatch) {
      return null;
    }
    return this._currentMatch.index;
  }

  get currentMatch(): ISearchMatch | null {
    return this._currentMatch;
  }

  /**
   * Set to true if the widget under search is read-only, false
   * if it is editable.  Will be used to determine whether to show
   * the replace option.
   */
  readonly isReadOnly = false;

  private _currentMatch: ISearchMatch | null;
  private _matches: ISearchMatch[] = [];
  private _target: CSVDocumentWidget;
  private _query: RegExp;
  private _changed = new Signal<this, void>(this);
}
