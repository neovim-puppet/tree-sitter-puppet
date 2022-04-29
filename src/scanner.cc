#include <tree_sitter/parser.h>
#include <string>
#include <cwctype>

namespace {

using std::string;

enum TokenType {
	HEREDOC_START,
	HEREDOC_BODY_START,
	HEREDOC_BODY_END,
};

struct Scanner {
	void skip(TSLexer *lexer) {
		lexer->advance(lexer, true);
	}

	void advance(TSLexer *lexer) {
		lexer->advance(lexer, false);
		first_interpolation = true;
	}

	unsigned serialize(char *buffer) {
		if (heredoc_delimiter.length() + 3 >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return 0;
		buffer[1] = interpolation;
		buffer[2] = first_interpolation;
		heredoc_delimiter.copy(&buffer[3], heredoc_delimiter.length());
		return heredoc_delimiter.length() + 3;
	}

	void deserialize(const char *buffer, unsigned length) {
		if (length == 0) {
			reset();
		} else {
			interpolation = buffer[1];
			first_interpolation = buffer[2];
			heredoc_delimiter.assign(&buffer[3], &buffer[length]);
		}
	}

	bool scan_heredoc_start(TSLexer *lexer) {
		lexer->result_symbol = HEREDOC_START;
		reset();

		// @( <endtag> [:<syntax>] [/<escapes>] )
		for(;;){
			if (lexer->lookahead  == '\0' || lexer->lookahead == '\n') {
				reset();
				return false;
			} else if (lexer->lookahead == '"') {
				interpolation = true;
				advance(lexer);
			} else if (iswalnum(lexer->lookahead) || (interpolation && iswspace(lexer->lookahead))) {
				heredoc_delimiter += lexer->lookahead;
				advance(lexer);
			} else if (lexer->lookahead == ':') {
				advance(lexer);
				while (iswalnum(lexer->lookahead)) advance(lexer);
			} else if (lexer->lookahead == '/') {
				advance(lexer);
				while (iswalpha(lexer->lookahead)) advance(lexer);
			} else if (lexer->lookahead == ')') {
				return !heredoc_delimiter.empty();
			} else if (iswspace(lexer->lookahead)) {
				skip(lexer);
			} else {
				reset();
				return false;
			}
		}
	}

	bool scan_heredoc_end_identifier(TSLexer *lexer) {
		current_leading_word.clear();
		while( iswspace(lexer->lookahead) || lexer->lookahead == '|' || lexer->lookahead == '-') advance(lexer);

		// Scan the first 'n' characters on this line, to see if they match the heredoc delimiter
		while (
		current_leading_word.length() < heredoc_delimiter.length()
			&& ( iswalnum(lexer->lookahead) || (interpolation && iswspace(lexer->lookahead)))
			) {
				current_leading_word += lexer->lookahead;
				advance(lexer);
		}
		return current_leading_word == heredoc_delimiter;
	}

	bool scan_heredoc_body(TSLexer *lexer) {
		for (;;) {
			switch (lexer->lookahead) {
				case '\0': {
					reset();
					return false;
				}
				case '\n': {
					if (scan_heredoc_end_identifier(lexer)) {
						reset();
						lexer->result_symbol = HEREDOC_BODY_END;
						return true;
					}
					break;
				}
				case '$': {
					if (interpolation) {
						if(first_interpolation){
							first_interpolation = false;
							lexer->result_symbol = HEREDOC_BODY_START;
							return true;
						} else {
							return false;
						}
					} else {
						advance(lexer);
						break;
					}
				}
				default: {
					advance(lexer);
				}
			}
		}
	}

	bool scan(TSLexer *lexer, const bool *valid_symbols) {
		if ( !heredoc_delimiter.empty()) {
			if (valid_symbols[HEREDOC_BODY_START] || valid_symbols[HEREDOC_BODY_END]) {
				return scan_heredoc_body(lexer);
			}
		}
		if (valid_symbols[HEREDOC_START]){
			return scan_heredoc_start(lexer);
		}
		return false;
	}

	void reset(){
		interpolation = false;
		first_interpolation = true;
		heredoc_delimiter.clear();
	}

	string heredoc_delimiter;
	string current_leading_word;
	bool interpolation;
	bool first_interpolation;
};

}

extern "C" {
void *tree_sitter_puppet_external_scanner_create() {
	return new Scanner();
}

bool tree_sitter_puppet_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
	Scanner *scanner = static_cast<Scanner *>(payload);
	return scanner->scan(lexer, valid_symbols);
}

unsigned tree_sitter_puppet_external_scanner_serialize(void *payload, char *state) {
	Scanner *scanner = static_cast<Scanner *>(payload);
	return scanner->serialize(state);
}

void tree_sitter_puppet_external_scanner_deserialize(void *payload, const char *state, unsigned length) {
	Scanner *scanner = static_cast<Scanner *>(payload);
	scanner->deserialize(state, length);
}

void tree_sitter_puppet_external_scanner_destroy(void *payload) {
	Scanner *scanner = static_cast<Scanner *>(payload);
	delete scanner;
}
}
