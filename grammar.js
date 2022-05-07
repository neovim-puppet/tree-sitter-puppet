const PREC = {
  NOT: 1,
  UNARY_MINUS: 2,
  SPLAT: 3,
  IN: 4,
  REGEX_RELATIONAL: 5,
  MULTIPLICATIVE: 6,
  DIVISION: 6,
  MODULO: 6,
  ADDITIVE: 7,
  SHIFT: 8,
  RELATIONAL: 9,
  COMPARISON: 10,
  AND: 11,
  OR: 12,
  ASSIGNMENT: 13,

  HASH_ELEMENT: 10,
  UNPROTECTED_STRING: -10,
  LITERALS: -5,
  VALUE: -1,
  SELECTOR: 20,
  IDENTIFIER: 2,
};

module.exports = grammar({
  name: 'puppet',

  extras: $ => [
    $.comment,
    /\n/,
    /\s/,
    /\r/,
  ],

  conflicts: $ => [
    [$.identifier, $.reference_identifier],
    [$.identifier],
  ],

  externals: $ => [
    $.heredoc_start,
    $._heredoc_body_start,
    $._heredoc_body_end,
  ],

  rules: {
    manifest: $ => repeat(
      $._statement,
    ),

    _statement: $ => choice(
      $.resource_declaration,
      $.resource_call,
      $._conditionals,
      $._expression,
      $._composition,
      $.type_declaration,
      $.function_declaration,
      $.resource_defaults,
      $.relation,
      $.resource_collector,
      $.exported_resource_collector,
      $.node,
    ),

    body: $ => seq(
      '{',
      repeat($._statement),
      '}',
    ),

    _conditionals: $ => choice(
      $.if,
      $.unless,
      $.case,
    ),

    if: $ => seq(
      'if',
      $._expression,
      $.body,
      repeat($.elsif),
      optional($.else)
    ),

    unless: $ => seq(
      'unless',
      $._expression,
      $.body,
      optional($.else),
    ),

    elsif: $ => seq('elsif', $._expression, $.body),

    else: $ => seq('else', $.body),

    case: $ =>  seq(
      'case',
      choice($.variable,$._value),
      '{',
      repeat($.case_item),
      optional($.case_default),
      '}',
    ),

    case_item: $ => seq(
      listOf($._expression),
      ':',
      $.body
    ),

    case_default: $ => seq(
      'default',
      ':',
      $.body,
    ),

    selector: $ => prec(PREC.SELECTOR, seq(
      $._value,
      '?',
      '{',
      listOf($.selector_item),
      optional(','),
      '}',
    )),

    selector_item: $ => seq(
      choice($.default, alias($._expression, $.key)),
      '=>',
      $._value,
    ),


    assignment: $ => prec(PREC.ASSIGNMENT,seq(
      $.variable,
      prec(PREC.ASSIGNMENT, alias('=', $.operator)),
      $._value,
    )),

    _expression: $ => choice(
      $.expression_group,
      $.command_binary,
      $.command_unary,
      $._arg
    ),

    _arg: $ => prec(-1,choice(
      $.assignment,
      $.binary,
      $.unary,
      $.variable,
      $._value,
    )),

    binary: $ => {
      const operators = [
        [prec.left, PREC.AND, 'and'],
        [prec.left, PREC.OR, 'or'],
        [prec.left, PREC.SHIFT, choice('<<', '>>')],
        [prec.left, PREC.COMPARISON, choice('<', '<=', '>', '>=')],
        [prec.left, PREC.ADDITIVE, choice('+', '-')],
        [prec.left, PREC.IN, 'in'],
        [prec.left, PREC.MULTIPLICATIVE, choice('/', '%', '*')],
        [prec.right, PREC.RELATIONAL, choice('==', '!=')],
        [prec.right, PREC.REGEX_RELATIONAL, choice('=~', '!~')],
      ];

      return choice(...operators.map(([fn, precedence, operator]) => fn(precedence, seq(
        field('left', $._arg),
        alias(operator, $.operator),
        field('right', $._arg)
      ))));
    },

    expression_group: $=> seq(
      '(',
      $._expression,
      ')',
    ),

    command_binary: $ => prec.left(2,seq(
      field('left', $._expression),
      field('operator', choice('or', 'and')),
      field('right', $._expression)
    )),

    unary: $ => {
      const operators = [
        [prec.right, PREC.NOT, '!'],
        [prec.right, PREC.UNARY_MINUS, '-'],
        [prec.right, PREC.SPLAT, '*'],
      ];

      return choice(...operators.map(([fn, precedence, operator]) => fn(precedence, seq(
        field('operator', operator),
        field('operand', $._arg)
      ))));
    },

    command_unary: $ => {
      const operators = [
        [prec.right, PREC.NOT, '!'],
        [prec.right, PREC.UNARY_MINUS, '-'],
        [prec.right, PREC.SPLAT, '*'],
      ];
      return choice(...operators.map(([fn, precedence, operator]) => fn(precedence, seq(
        field('operator', operator),
        field('operand', $._expression)
      ))));
    },

    // composition
    _composition: $ => choice($.contain, $.include, $.require),
    contain: $  => seq('contain', $._composition_targets),
    include: $  => seq('include', $._composition_targets),
    require: $  => seq('require', $._composition_targets),

    _composition_targets: $ => choice(
      listOf($.identifier),
      $.reference,
      $.identifier_array,
      $.variable,
      $.string_array,
      $.string,
    ),

    reference: $ => seq(
      alias($.reference_identifier,$.identifier),
      token.immediate('['),
      choice(
        $._value,
        $.variable,
      ),
      ']',
    ),

    type_declaration: $ => seq(
      'type',
      alias($.reference_identifier, $.type_identifier),
      alias('=', $.operator),
      $.type,
    ),

    type: $ => choice(
      prec.left(1,seq(
        $.reference_identifier,
        seq(
          '[',
          choice(
            listOf($.type),
            listOf($.string),
            listOf($.integer),
            listOf($.regex),
          ),
          ']',
        ),
      )),
      $.reference_identifier
    ),

    identifier_array: $ => seq(
      '[',
      listOf($.identifier),
      ']',
    ),

    string_array: $ => seq(
      '[',
      listOf($.string),
      ']',
    ),

    method_chain: $ => prec.left(seq(
      field('left', $._value),
      alias('.', $.operator),
      field('left', $.method_call),
    )),

    function_call: $ => prec.left(1,seq(
      alias($.identifier,$.function),
      $._function_arguments,
      optional($.lambda),
    )),

    method_call: $ => prec.right(1,seq(
      alias($.identifier,$.function),
      optional($._function_arguments),
      optional($.lambda),
    )),

    _function_arguments: $ => seq(
      '(',
      field( 'arguments', optional(listOf(choice($._expression,$.type)))),
      ')',
    ),

    lambda: $ => seq(
      optional(seq(
        '|',
        field('parameter', listOf($.variable)),
        '|',
      )),
      $.body
    ),

    function_declaration: $ => seq(
      'function',
      $.identifier,
      optional($.parameter_list),
      optional(seq('>>', $.type)),
      $.body
    ),

    resource_declaration: $=> seq(
      choice('class', 'define', 'plan'),
      $.identifier,
      optional($.parameter_list),
      optional($.inheritance),
      $.body,
    ),

    inheritance: $ => seq('inherits', $.identifier),

    node: $ => seq(
      'node',
      choice(
        $.string,
        $.regex,
        'default',
      ),
      $.body,
    ),

    parameter_list: $ => seq(
      '(',
      optional(listOf($.parameter)),
      optional(','),
      ')',
    ),

    parameter: $ => seq(
      optional($.type),
      $.variable,
      optional(seq(
        '=',
        $._expression,
      ),),
    ),

    resource_call: $ => seq(
      choice(
        seq(alias('@', $.virtual), $.identifier),
        seq(alias('@@', $.exported), $.identifier),
        alias('class', $.identifier),
        $.identifier,
      ),
      '{',
      listOf($._resource_arguments, ';'),
      optional(';'),
      '}',
    ),

    _resource_arguments: $ => seq(
      alias(choice($.string, $.array, $.variable, $.unprotected_string), $.resource_title),
      ':',
      optional($.argument_list),
    ),

    resource_defaults: $ => seq(
      alias($.reference_identifier, $.resource_type),
      '{',
      $.argument_list,
      '}',
    ),

    resource_collector: $ => prec.right(seq(
      $.reference_identifier,
      alias('<|', $.operator),
      optional($._expression),
      alias('|>', $.operator),
      optional(seq(
        '{',
        $.argument_list,
        '}',
      )),
    )),

    exported_resource_collector: $ => prec.right(seq(
      $.reference_identifier,
      alias('<<|', $.operator),
      optional($._expression),
      alias('|>>', $.operator),
      optional(seq(
        '{',
        $.argument_list,
        '}',
      )),
    )),

    relation: $ => prec.left(seq(
      $.chain_element,
      $.chaining_arrow,
      $.chain_element,
    )),

    chaining_arrow: $ => choice('->', '~>'),
    chain_element: $ => choice($.relation, $.resource_call, $.reference, $.resource_collector),

    argument_list: $ => seq(
      listOf($.argument),
      optional(','),
    ),

    argument: $ => seq(
      $.argument_name,
      alias('=>', $.operator),
      alias($._value, $.argument_value),
    ),

    argument_name: $ => choice(
      $.unprotected_string,
      $.string,
      '*',
    ),

    variable: $ => seq(
      '$',
      $._variable_name,
    ),

    _variable_name: $ => choice(
      $.identifier,
      seq('_', $.name),
    ),

    identifier: $ => prec.right(PREC.IDENTIFIER ,seq(
        optional(choice(
          '::',
          seq(choice($.name, $.identifier), token.immediate('::')),
        )),
        $.name,
    )),

    reference_identifier: $ => prec.left(seq(
      optional('::'),
      repeat1(
        choice(
          token.immediate('::'),
          alias($.reference_name, $.name),
        ),
      ),
    )),

    name:           $ => /[a-z]\w*/,
    reference_name: $ => /[A-Z]\w*/,

    array: $ => seq(
      '[',
      optional(listOf($._value)),
      optional(','),
      ']',
    ),

    hash: $ => seq(
      '{',
      optional(listOf($.hash_element)),
      optional(','),
      '}',
    ),

    hash_element: $ => seq(
      alias($._value,$.key),
      '=>',
      $._value,
    ),

    element_reference: $ => seq(
      $.variable,
      $._element_identifier,
    ),
    _element_identifier: $ => prec.right(
      repeat1(
        seq(
          '[',
          choice($.string, $._array_element),
          ']',
        )),
    ),

    _array_element: $ => seq(
      $.integer,
      optional(seq(',', $.integer))
    ),

    _value: $ => prec(PREC.VALUE,choice(
      $._expression,
      $._literals,
      $.function_call,
      $.selector,
      $.reference,
      $.element_reference,
      $.method_chain,
      $.heredoc,
    )),

    _literals: $=> prec(PREC.LITERALS, choice(
      $.array,
      $.hash,
      $._boolean,
      $._number,
      $.string,
      $.unprotected_string,
      $.undef,
      $.regex,
    )),

    _number: $ => choice($.float, $.integer),
    integer: $ => /-?\d+/,
    float:   $ => /-?\d+\.\d*/,
    _boolean: $ => choice($.true, $.false),
    true: $ => 'true',
    false: $ => 'false',
    undef: $ => 'undef',
    default: $ => 'default',

    string: $ => choice(
      $._fixed_string,
      $._expandable_string,
    ),

    _fixed_string: $ => seq(
      "'",
      repeat(
        choice(
          alias($._string_content_single, $.string_content),
          alias($._escape_sequence_single, $.escape_sequence),
        )
      ),
      "'"
    ),

    _expandable_string: $ => seq(
      /"/,
      repeat( choice(
        $.string_content,
        $.interpolation,
        $.escape_sequence,
        $.variable,
      )),
      /"/
    ),

    unprotected_string: $ => prec(PREC.UNPROTECTED_STRING,seq(
      optional('_'),
      /[a-z]\w*/,
    )),

    string_content: $ => /[^"$\\]+/,
    _string_content_single: $ => /[^'\\]+/,

    interpolation: $ => seq(
      '${',
      choice(
        alias(
          seq(
            $._variable_name,
            optional($._element_identifier)
          ),
          $.variable
        ),
        $._expression,
      ),
      '}'
    ),

    escape_sequence: $ => seq(
      '\\',
      choice(
        '\\',
        'n',
        'r',
        't',
        's',
        '$',
        /u[0-9a-z]{4}/,
        /u\{[0-9a-z]\}{6}/,
        '"',
        "'",
      )
    ),

    _escape_sequence_single: $ => seq(
      '\\',
      choice(
        '\\',
        "'",
      )
    ),

    regex: $ => seq(
      '/',
      /[^/]*/,
      '/',
    ),

    heredoc: $ => seq(
      '@(',
      $.heredoc_start,
      ')',
      $.heredoc_body,
    ),

    heredoc_body: $=> choice(
      $._heredoc_body_end,
      seq(
        repeat(choice(
          $._heredoc_body_start,
          $.interpolation,
          $.escape_sequence,
        )),
        $._heredoc_body_end
      )
    ),

    comment: $ => /#.*/,
  }
})

function listOf(rule, sep = ',') {
  return seq(
    rule,
    repeat(seq(
      sep,
      rule
    )),
  )
}
