/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2021 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import * as React from 'react';
import type { Store } from '@react-pdf-viewer/core/lib';

import { EMPTY_KEYWORD_REGEXP } from './constants';
import { normalizeSingleKeyword } from './normalizeKeyword';
import Match from './types/Match';
import SingleKeyword from './types/SingleKeyword';
import StoreProps from './types/StoreProps';
import useDocument from './useDocument';

interface UseSearch {
    clearKeyword(): void;
    changeMatchCase(matchCase: boolean): void;
    changeWholeWords(wholeWords: boolean): void;
    currentMatch: number;
    jumpToMatch(index: number): Match | null;
    jumpToNextMatch(): Match | null;
    jumpToPreviousMatch(): Match | null;
    keywords: SingleKeyword[];
    matchCase: boolean;
    numberOfMatches: number;
    wholeWords: boolean;
    search(): Promise<Match[]>;
    setKeywords(keyword: SingleKeyword[]): void;
    searchFor(keyword: SingleKeyword[], matchCase?: boolean, wholeWords?: boolean): Promise<Match[]>;
    // Compatible with the single keyword search
    keyword: string;
    setKeyword(keyword: string): void;
}

const useSearch = (store: Store<StoreProps>): UseSearch => {
    const currentDocRef = useDocument(store);
    const [keywords, setKeywords] = React.useState<SingleKeyword[]>([]);
    const [found, setFound] = React.useState<Match[]>([]);
    const [currentMatch, setCurrentMatch] = React.useState(0);
    const [matchCase, setMatchCase] = React.useState(false);
    const textContents = React.useRef<string[]>([]);
    const [wholeWords, setWholeWords] = React.useState(false);

    const changeMatchCase = (isChecked: boolean): void => {
        setMatchCase(isChecked);
        if (keywords.length > 0) {
            searchFor(keywords, isChecked, wholeWords);
        }
    };

    const changeWholeWords = (isChecked: boolean): void => {
        setWholeWords(isChecked);
        if (keywords.length > 0) {
            searchFor(keywords, matchCase, isChecked);
        }
    };

    const jumpToMatch = (index: number): Match | null => {
        if (keywords.length === 0 || found.length === 0) {
            return null;
        }

        // Make sure that the `index` is in the range of 1 and `found.length`
        const normalizedIndex = Math.max(1, Math.min(found.length, index));

        setCurrentMatch(normalizedIndex);
        return jumpToGivenMatch(found[normalizedIndex - 1]);
    };

    const jumpToPreviousMatch = (): Match | null => jumpToMatch(currentMatch - 1);

    const jumpToNextMatch = (): Match | null => jumpToMatch(currentMatch + 1);

    const clearKeyword = (): void => {
        if (keywords.length === 0) {
            // Do nothing
            return;
        }
        store.update('keyword', [EMPTY_KEYWORD_REGEXP]);

        setKeyword('');
        setCurrentMatch(0);
        setFound([]);
        setMatchCase(false);
        setWholeWords(false);
    };

    const search = () => searchFor(keywords, matchCase, wholeWords);

    const setKeyword = (keyword: string) => setKeywords(keyword === '' ? [] : [keyword]);

    // Private
    // -------

    const getTextContents = (): Promise<string[]> => {
        const currentDoc = currentDocRef.current;
        if (!currentDoc) {
            return Promise.resolve([]);
        }

        const promises = Array(currentDoc.numPages)
            .fill(0)
            .map((_, pageIndex) => {
                return currentDoc
                    .getPage(pageIndex + 1)
                    .then((page) => {
                        return page.getTextContent();
                    })
                    .then((content) => {
                        const pageContent = content.items.map((item) => item.str || '').join('');
                        return Promise.resolve({
                            pageContent,
                            pageIndex,
                        });
                    });
            });
        return Promise.all(promises).then((data) => {
            data.sort((a, b) => a.pageIndex - b.pageIndex);
            return Promise.resolve(data.map((item) => item.pageContent));
        });
    };

    const jumpToGivenMatch = (match: Match): Match => {
        const jumpToPage = store.get('jumpToPage');
        if (jumpToPage) {
            jumpToPage(match.pageIndex);
        }
        store.update('matchPosition', {
            matchIndex: match.matchIndex,
            pageIndex: match.pageIndex,
        });
        return match;
    };

    const getKeywordSource = (keyword: SingleKeyword): string => {
        if (keyword instanceof RegExp) {
            return keyword.source;
        }
        if (typeof keyword === 'string') {
            return keyword;
        }
        return keyword.keyword;
    };

    const searchFor = (
        keywordParam: SingleKeyword[],
        matchCaseParam?: boolean,
        wholeWordsParam?: boolean
    ): Promise<Match[]> => {
        const keywords = keywordParam.map((k) => normalizeSingleKeyword(k, matchCaseParam, wholeWordsParam));
        store.update('keyword', keywords);

        setCurrentMatch(0);
        setFound([]);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return new Promise((resolve, _) => {
            const getTextPromise =
                textContents.current.length === 0
                    ? getTextContents().then((response) => {
                          textContents.current = response;
                          return Promise.resolve(response);
                      })
                    : Promise.resolve(textContents.current);

            getTextPromise.then((response) => {
                const arr: Match[] = [];
                response.forEach((pageText, pageIndex) => {
                    keywords.forEach((keyword) => {
                        let matchIndex = 0;
                        let matches: RegExpExecArray | null;
                        while ((matches = keyword.exec(pageText)) !== null) {
                            arr.push({
                                keyword,
                                matchIndex,
                                pageIndex,
                                pageText,
                                startIndex: matches.index,
                                endIndex: keyword.lastIndex,
                            });
                            matchIndex++;
                        }
                    });
                });
                setFound(arr);
                if (arr.length > 0) {
                    setCurrentMatch(1);
                    jumpToGivenMatch(arr[0]);
                }

                resolve(arr);
            });
        });
    };

    React.useEffect(() => {
        // Reset the text contents when the document changes
        textContents.current = [];
    }, [currentDocRef.current]);

    return {
        clearKeyword,
        changeMatchCase,
        changeWholeWords,
        currentMatch,
        jumpToMatch,
        jumpToNextMatch,
        jumpToPreviousMatch,
        keywords,
        matchCase,
        numberOfMatches: found.length,
        wholeWords,
        search,
        searchFor,
        setKeywords,
        // Compatible with the single keyword search
        keyword: keywords.length === 0 ? '' : getKeywordSource(keywords[0]),
        setKeyword,
    };
};

export default useSearch;
